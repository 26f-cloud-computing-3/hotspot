import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_engine
from app.main import app
from app.models.collection import Collection
from app.models.collection_history import CollectionAction, CollectionHistory

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
CAROL = str(uuid.uuid4())

PROFILES = {
    ALICE: {"email": "alice@example.com", "name": "Alice Kim"},
    BOB: {"email": "bob@example.com", "name": "Bob Lee"},
    CAROL: {"email": "carol@example.com", "name": "Carol Kim"},
}

CAFE = {"id": "1001", "provider": "kakao", "name": "Cafe Onion", "lat": 37.54, "lng": 127.05}


def _sign_in(user_id):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=user_id, **PROFILES[user_id]
    )


@pytest.fixture
def client(engine):
    """A client whose database holds Alice, Bob and Carol, with Alice following Bob."""
    app.dependency_overrides[get_engine] = lambda: engine
    client = TestClient(app)
    for user_id in PROFILES:
        _sign_in(user_id)
        assert client.get("/api/me").status_code == 200
    _sign_in(ALICE)
    assert client.put(f"/api/follows/{BOB}").status_code == 204
    yield client
    app.dependency_overrides.clear()


def _create(client, name="Cafes", is_public=True):
    return client.post("/api/collections", json={"name": name, "is_public": is_public}).json()


def _feed(client, **params):
    _sign_in(ALICE)
    res = client.get("/api/feed", params=params)
    assert res.status_code == 200
    return res.json()


def _summary(client):
    """Alice's feed as (type, collection name, place name), order ignored.

    Rows written through the API within one second tie on SQLite's timestamp, so their
    order is not meaningful here; test_pages_follow_the_continuation covers ordering.
    """
    items = _feed(client)["items"]
    return sorted((item["type"], item["collection_name"], item["place_name"]) for item in items)


def test_requires_auth(client):
    app.dependency_overrides.pop(get_current_user)
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="https://example.supabase.co"
    )
    assert client.get("/api/feed").status_code == 401


def test_shows_what_a_followed_user_did_to_a_public_collection(client):
    _sign_in(BOB)
    collection = _create(client)
    client.post(f"/api/collections/{collection['id']}/places", json=CAFE)
    client.delete(f"/api/collections/{collection['id']}/places/kakao/1001")
    client.patch(f"/api/collections/{collection['id']}", json={"name": "Seongsu"})

    assert _summary(client) == [
        ("collection_added", "Cafes", None),
        ("collection_renamed", "Seongsu", None),
        ("place_added", "Cafes", "Cafe Onion"),
        ("place_removed", "Cafes", "Cafe Onion"),
    ]
    item = _feed(client)["items"][0]
    assert item["actor"] == {"id": BOB, "name": "Bob Lee", "handle": "bob", "avatar_url": None}
    assert item["collection_id"] == collection["id"]


def test_leaves_out_users_not_followed_and_oneself(client):
    _sign_in(CAROL)
    _create(client, "Carol's")
    _sign_in(ALICE)
    _create(client, "Alice's")
    assert _summary(client) == []


def test_unfollowing_empties_the_feed(client):
    _sign_in(BOB)
    _create(client)
    assert len(_summary(client)) == 1
    client.delete(f"/api/follows/{BOB}")
    assert _summary(client) == []


def test_hides_activity_on_private_collections(client):
    _sign_in(BOB)
    collection = _create(client, is_public=False)
    client.post(f"/api/collections/{collection['id']}/places", json=CAFE)
    client.patch(f"/api/collections/{collection['id']}", json={"name": "Secret"})
    assert _summary(client) == []


def test_publishing_announces_the_collection_but_not_its_private_past(client):
    _sign_in(BOB)
    collection = _create(client, is_public=False)
    client.post(f"/api/collections/{collection['id']}/places", json=CAFE)
    client.patch(f"/api/collections/{collection['id']}", json={"is_public": True})
    assert _summary(client) == [("collection_added", "Cafes", None)]


def test_unpublishing_hides_earlier_activity_until_published_again(client):
    _sign_in(BOB)
    collection = _create(client)
    client.post(f"/api/collections/{collection['id']}/places", json=CAFE)

    _sign_in(BOB)
    client.patch(f"/api/collections/{collection['id']}", json={"is_public": False})
    assert _summary(client) == []

    _sign_in(BOB)
    client.patch(f"/api/collections/{collection['id']}", json={"is_public": True})
    assert _summary(client) == [
        ("collection_added", "Cafes", None),
        ("collection_added", "Cafes", None),
        ("place_added", "Cafes", "Cafe Onion"),
    ]


def test_deleting_a_public_collection_leaves_only_the_removal(client, engine):
    _sign_in(BOB)
    collection = _create(client)
    client.post(f"/api/collections/{collection['id']}/places", json=CAFE)
    assert client.delete(f"/api/collections/{collection['id']}").status_code == 204
    # SQLite does not enforce the foreign key that nulls collection_id in Postgres.
    with Session(engine) as db:
        for row in db.query(CollectionHistory):
            row.collection_id = None
        db.commit()

    assert _summary(client) == [("collection_removed", "Cafes", None)]
    assert _feed(client)["items"][0]["collection_id"] is None


def test_deleting_a_private_collection_shows_nothing(client):
    _sign_in(BOB)
    collection = _create(client)
    client.patch(f"/api/collections/{collection['id']}", json={"is_public": False})
    client.delete(f"/api/collections/{collection['id']}")
    assert _summary(client) == []


def test_pages_follow_the_continuation(client, engine):
    start = datetime(2026, 1, 1, tzinfo=UTC)
    with Session(engine) as db:
        collection = Collection(owner_id=uuid.UUID(BOB), name="Cafes", is_public=True)
        db.add(collection)
        db.flush()
        for index in range(5):
            db.add(
                CollectionHistory(
                    actor_id=collection.owner_id,
                    collection_id=collection.id,
                    action=CollectionAction.PLACE_ADDED,
                    collection_name=collection.name,
                    is_public=True,
                    place_name=f"Place {index}",
                    # Places 1 and 2 share a timestamp, so the id has to break the tie.
                    created_at=start + timedelta(minutes=2 if index == 1 else index),
                )
            )
        db.commit()

    seen = []
    continuation = None
    for expected_size in (2, 2, 1):
        page = _feed(client, limit=2, **({"continuation": continuation} if continuation else {}))
        assert len(page["items"]) == expected_size
        seen += [item["place_name"] for item in page["items"]]
        continuation = page["continuation"]
    assert continuation is None
    assert seen[0] == "Place 4" and seen[1] == "Place 3" and seen[4] == "Place 0"
    assert sorted(seen[2:4]) == ["Place 1", "Place 2"]


def test_last_full_page_has_no_continuation(client):
    _sign_in(BOB)
    _create(client)
    assert _feed(client, limit=1)["continuation"] is None


def test_rejects_a_malformed_continuation(client):
    _sign_in(ALICE)
    assert client.get("/api/feed", params={"continuation": "nope"}).status_code == 400
    assert client.get("/api/feed", params={"limit": 0}).status_code == 422
