import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_engine
from app.main import app
from app.models.collection_history import CollectionHistory

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())

CAFE = {
    "id": "1001",
    "provider": "kakao",
    "name": "Cafe Onion",
    "address": "서울 성동구 성수동2가 277-135",
    "road_address": "서울 성동구 아차산로9길 8",
    "category": "음식점 > 카페",
    "phone": "02-1234-5678",
    "url": "http://place.map.kakao.com/1001",
    "lat": 37.5447,
    "lng": 127.0582,
    # Search results carry this, but it is not part of a saved place.
    "distance": 120,
}
BAR = {"id": "2002", "provider": "kakao", "name": "Bar Cham", "lat": 37.58, "lng": 126.97}


@pytest.fixture
def client(engine):
    app.dependency_overrides[get_engine] = lambda: engine
    yield TestClient(app)
    app.dependency_overrides.clear()


def _sign_in(user_id):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=user_id)


def _create(client, name="Cafes", **fields):
    return client.post("/api/collections", json={"name": name, **fields}).json()


def _place_history(engine):
    # SQLite timestamps tie within a second, so rely on its insertion (rowid) order instead.
    with Session(engine) as db:
        rows = db.scalars(
            select(CollectionHistory).where(CollectionHistory.place_name.is_not(None))
        )
        return [(r.action, r.collection_name, r.is_public, r.place_name) for r in rows]


def test_requires_auth(client):
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="https://example.supabase.co"
    )
    url = f"/api/collections/{uuid.uuid4()}/places"
    assert client.get(url).status_code == 401
    assert client.post(url, json=CAFE).status_code == 401
    assert client.delete(f"{url}/kakao/1001").status_code == 401


def test_add_place(client):
    _sign_in(ALICE)
    url = f"/api/collections/{_create(client)['id']}/places"

    res = client.post(url, json=CAFE)
    assert res.status_code == 201
    body = res.json()
    assert body.pop("added_at")
    assert body == {key: value for key, value in CAFE.items() if key != "distance"}
    assert [p["id"] for p in client.get(url).json()] == ["1001"]


def test_add_place_with_only_required_fields(client):
    _sign_in(ALICE)
    url = f"/api/collections/{_create(client)['id']}/places"

    res = client.post(url, json=BAR)
    assert res.status_code == 201
    body = res.json()
    assert body["address"] == ""
    assert body["road_address"] is None
    assert body["url"] is None


def test_adding_the_same_place_again_changes_nothing(client, engine):
    _sign_in(ALICE)
    url = f"/api/collections/{_create(client)['id']}/places"
    client.post(url, json=CAFE)

    res = client.post(url, json={**CAFE, "name": "Renamed"})
    assert res.status_code == 200
    assert res.json()["name"] == "Cafe Onion"
    assert len(client.get(url).json()) == 1
    assert _place_history(engine) == [("place_added", "Cafes", False, "Cafe Onion")]


def test_same_place_can_be_in_several_collections(client):
    _sign_in(ALICE)
    cafes = _create(client, "Cafes")
    dates = _create(client, "Date spots")

    assert client.post(f"/api/collections/{cafes['id']}/places", json=CAFE).status_code == 201
    assert client.post(f"/api/collections/{dates['id']}/places", json=CAFE).status_code == 201


def test_same_id_from_another_provider_is_a_different_place(client):
    _sign_in(ALICE)
    url = f"/api/collections/{_create(client)['id']}/places"
    client.post(url, json=CAFE)

    assert client.post(url, json={**CAFE, "provider": "naver"}).status_code == 201
    assert len(client.get(url).json()) == 2


@pytest.mark.parametrize(
    "fields",
    [
        {"id": ""},
        {"provider": "bing"},
        {"name": "   "},
        {"name": "x" * 201},
        {"lat": 91},
        {"lng": -181},
        {"url": "javascript:alert(1)"},
    ],
)
def test_add_rejects_invalid_place(client, engine, fields):
    _sign_in(ALICE)
    url = f"/api/collections/{_create(client)['id']}/places"

    assert client.post(url, json={**CAFE, **fields}).status_code == 422
    assert client.get(url).json() == []
    assert _place_history(engine) == []


def test_remove_place(client):
    _sign_in(ALICE)
    url = f"/api/collections/{_create(client)['id']}/places"
    client.post(url, json=CAFE)
    client.post(url, json=BAR)

    assert client.delete(f"{url}/kakao/1001").status_code == 204
    assert [p["id"] for p in client.get(url).json()] == ["2002"]


def test_removing_a_place_that_is_not_there_changes_nothing(client, engine):
    _sign_in(ALICE)
    url = f"/api/collections/{_create(client)['id']}/places"
    client.post(url, json=CAFE)

    assert client.delete(f"{url}/kakao/9999").status_code == 204
    assert client.delete(f"{url}/naver/1001").status_code == 204
    assert len(client.get(url).json()) == 1
    assert _place_history(engine) == [("place_added", "Cafes", False, "Cafe Onion")]


def test_add_and_remove_record_history(client, engine):
    _sign_in(ALICE)
    url = f"/api/collections/{_create(client, is_public=True)['id']}/places"

    client.post(url, json=CAFE)
    client.delete(f"{url}/kakao/1001")

    assert _place_history(engine) == [
        ("place_added", "Cafes", True, "Cafe Onion"),
        ("place_removed", "Cafes", True, "Cafe Onion"),
    ]


def test_others_collection_is_not_found(client, engine):
    _sign_in(BOB)
    url = f"/api/collections/{_create(client, is_public=True)['id']}/places"
    client.post(url, json=CAFE)

    _sign_in(ALICE)
    assert client.get(url).status_code == 404
    assert client.post(url, json=BAR).status_code == 404
    assert client.delete(f"{url}/kakao/1001").status_code == 404

    _sign_in(BOB)
    assert [p["id"] for p in client.get(url).json()] == ["1001"]
    assert _place_history(engine) == [("place_added", "Cafes", True, "Cafe Onion")]


def test_missing_collection_is_not_found(client):
    _sign_in(ALICE)
    url = f"/api/collections/{uuid.uuid4()}/places"
    assert client.get(url).status_code == 404
    assert client.post(url, json=CAFE).status_code == 404
    assert client.delete(f"{url}/kakao/1001").status_code == 404


def test_place_count(client):
    _sign_in(ALICE)
    cafes = _create(client, "Cafes")
    _create(client, "Empty")
    url = f"/api/collections/{cafes['id']}/places"
    client.post(url, json=CAFE)
    client.post(url, json=BAR)

    counts = {c["name"]: c["place_count"] for c in client.get("/api/collections").json()}
    assert counts == {"Cafes": 2, "Empty": 0}

    client.delete(f"{url}/kakao/1001")
    renamed = client.patch(f"/api/collections/{cafes['id']}", json={"name": "Bars"}).json()
    assert renamed["place_count"] == 1


def test_list_reports_which_collections_contain_a_place(client):
    _sign_in(BOB)
    client.post(f"/api/collections/{_create(client, 'Bob')['id']}/places", json=CAFE)
    _sign_in(ALICE)
    cafes = _create(client, "Cafes")
    _create(client, "Bars")
    client.post(f"/api/collections/{cafes['id']}/places", json=CAFE)

    res = client.get("/api/collections", params={"provider": "kakao", "place_id": "1001"})
    assert {c["name"]: c["contains_place"] for c in res.json()} == {"Cafes": True, "Bars": False}

    res = client.get("/api/collections", params={"provider": "kakao", "place_id": "2002"})
    assert {c["name"]: c["contains_place"] for c in res.json()} == {"Cafes": False, "Bars": False}

    assert [c["contains_place"] for c in client.get("/api/collections").json()] == [None, None]


@pytest.mark.parametrize("params", [{"provider": "kakao"}, {"place_id": "1001"}])
def test_list_needs_provider_and_place_id_together(client, params):
    _sign_in(ALICE)
    assert client.get("/api/collections", params=params).status_code == 422
