import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.search_histories import HISTORY_LIMIT, POPULAR_WINDOW
from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_engine
from app.main import app
from app.models.search_history import SearchHistory

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())

URL = "/api/search-histories"


def _sign_in(user_id):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=user_id)


@pytest.fixture
def client(engine):
    app.dependency_overrides[get_engine] = lambda: engine
    _sign_in(ALICE)
    yield TestClient(app)
    app.dependency_overrides.clear()


def _record(client, query):
    res = client.post(URL, json={"query": query})
    assert res.status_code == 200
    return res.json()


def _queries(body):
    return [item["query"] for item in body]


def _list(client):
    res = client.get(URL)
    assert res.status_code == 200
    return res.json()


def test_requires_auth(client):
    app.dependency_overrides.pop(get_current_user)
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="https://example.supabase.co"
    )
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={"query": "성수 카페"}).status_code == 401
    assert client.delete(URL).status_code == 401
    assert client.delete(f"{URL}/{uuid.uuid4()}").status_code == 401


def test_starts_empty(client):
    assert _list(client) == []


def test_lists_most_recent_first(client):
    _record(client, "성수 카페")
    body = _record(client, "대전 빵집")
    assert _queries(body) == ["대전 빵집", "성수 카페"]
    # Recording returns the same list a later read does.
    assert _list(client) == body


def test_query_is_trimmed(client):
    assert _queries(_record(client, "  성수 카페  ")) == ["성수 카페"]


def test_repeated_query_moves_to_the_top_without_duplicating(client, engine):
    first = _record(client, "성수 카페")[0]
    _record(client, "대전 빵집")
    body = _record(client, " 성수 카페")
    assert _queries(body) == ["성수 카페", "대전 빵집"]
    assert body[0]["id"] == first["id"]
    with Session(engine) as db:
        assert len(db.scalars(select(SearchHistory)).all()) == 2


def test_oldest_query_is_evicted_beyond_the_limit(client, engine):
    for i in range(HISTORY_LIMIT):
        _record(client, f"검색어 {i}")
    # Searching the oldest one again spares it; "검색어 1" is now the oldest.
    _record(client, "검색어 0")
    body = _record(client, "새 검색어")

    assert len(body) == HISTORY_LIMIT
    assert _queries(body)[:2] == ["새 검색어", "검색어 0"]
    assert "검색어 1" not in _queries(body)
    assert _list(client) == body
    # The evicted query is hidden, not deleted, so that popular searches still count it.
    with Session(engine) as db:
        rows = db.scalars(select(SearchHistory)).all()
        assert len(rows) == HISTORY_LIMIT + 1
        assert [row.query for row in rows if row.deleted_at is not None] == ["검색어 1"]


def _fill_and_hide_oldest(client):
    """Record HISTORY_LIMIT + 1 queries so that the first, "검색어 0", is hidden."""
    for i in range(HISTORY_LIMIT + 1):
        _record(client, f"검색어 {i}")
    assert "검색어 0" not in _queries(_list(client))


def test_hidden_query_comes_back_when_searched_again(client, engine):
    _fill_and_hide_oldest(client)
    body = _record(client, "검색어 0")
    assert len(body) == HISTORY_LIMIT
    assert _queries(body)[0] == "검색어 0"
    assert "검색어 1" not in _queries(body)
    with Session(engine) as db:
        # Brought back in place rather than added again; "검색어 1" took its place as hidden.
        assert len(db.scalars(select(SearchHistory)).all()) == HISTORY_LIMIT + 1
        hidden = db.scalars(select(SearchHistory).where(SearchHistory.deleted_at.is_not(None)))
        assert [row.query for row in hidden] == ["검색어 1"]


def test_hidden_query_is_purged_once_old(client, engine):
    _fill_and_hide_oldest(client)
    with Session(engine) as db:
        db.execute(
            update(SearchHistory)
            .where(SearchHistory.query == "검색어 0")
            .values(searched_at=datetime.now(UTC) - POPULAR_WINDOW - timedelta(minutes=1))
        )
        db.commit()
    _sign_in(BOB)
    # Any user's next search cleans it up.
    _record(client, "대전 빵집")
    with Session(engine) as db:
        queries = db.scalars(select(SearchHistory.query)).all()
        assert "검색어 0" not in queries
        assert len(queries) == HISTORY_LIMIT + 1


def test_hidden_query_cannot_be_deleted_by_id(client, engine):
    _fill_and_hide_oldest(client)
    with Session(engine) as db:
        hidden = db.scalar(select(SearchHistory).where(SearchHistory.query == "검색어 0"))
    assert client.delete(f"{URL}/{hidden.id}").status_code == 404


def test_clear_also_deletes_hidden_queries(client, engine):
    _fill_and_hide_oldest(client)
    assert client.delete(URL).status_code == 204
    with Session(engine) as db:
        assert db.scalars(select(SearchHistory)).all() == []


@pytest.mark.parametrize("query", ["", "   ", "가" * 101])
def test_rejects_invalid_query(client, query):
    assert client.post(URL, json={"query": query}).status_code == 422
    assert _list(client) == []


def test_accepts_query_at_the_length_limit(client):
    assert _queries(_record(client, "가" * 100)) == ["가" * 100]


def test_histories_are_per_user(client):
    _record(client, "성수 카페")
    _sign_in(BOB)
    assert _list(client) == []
    # The same query is a separate row for each user and does not count against the other.
    assert _queries(_record(client, "성수 카페")) == ["성수 카페"]
    for i in range(HISTORY_LIMIT):
        _record(client, f"밥 {i}")
    _sign_in(ALICE)
    assert _queries(_list(client)) == ["성수 카페"]


def test_delete_one(client):
    target = _record(client, "성수 카페")[0]
    _record(client, "대전 빵집")
    assert client.delete(f"{URL}/{target['id']}").status_code == 204
    assert _queries(_list(client)) == ["대전 빵집"]
    assert client.delete(f"{URL}/{target['id']}").status_code == 404
    assert client.delete(f"{URL}/not-a-uuid").status_code == 422


def test_cannot_delete_another_users_history(client):
    target = _record(client, "성수 카페")[0]
    _sign_in(BOB)
    assert client.delete(f"{URL}/{target['id']}").status_code == 404
    _sign_in(ALICE)
    assert _queries(_list(client)) == ["성수 카페"]


def test_clear_only_removes_own_histories(client):
    _record(client, "성수 카페")
    _sign_in(BOB)
    _record(client, "대전 빵집")
    assert client.delete(URL).status_code == 204
    assert _list(client) == []
    # Clearing an empty list is fine.
    assert client.delete(URL).status_code == 204
    _sign_in(ALICE)
    assert _queries(_list(client)) == ["성수 카페"]
