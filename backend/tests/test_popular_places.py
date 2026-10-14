import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.places import representative_snapshot
from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_engine
from app.main import app
from app.models.collection_place import CollectionPlace

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
CAROL = str(uuid.uuid4())
DAVE = str(uuid.uuid4())
ERIN = str(uuid.uuid4())

PROFILES = {
    ALICE: {"email": "alice@example.com", "name": "Alice Kim"},
    BOB: {"email": "bob@example.com", "name": "Bob Lee"},
    CAROL: {"email": "carol@example.com", "name": "Carol Kim"},
    DAVE: {"email": "dave@example.com", "name": "Dave Park"},
    ERIN: {"email": "erin@example.com", "name": "Erin Cho"},
}

CAFE = {
    "id": "1001",
    "provider": "kakao",
    "name": "Cafe Onion",
    "address": "서울 성동구 성수동2가 277-135",
    "category": "음식점 > 카페 > 커피전문점",
    "lat": 37.54,
    "lng": 127.05,
}
BAKERY = {"id": "2002", "provider": "kakao", "name": "Bakery", "lat": 37.55, "lng": 127.04}
PARK = {"id": "3003", "provider": "kakao", "name": "Seoul Forest", "lat": 37.54, "lng": 127.04}

START = datetime(2026, 1, 1, tzinfo=UTC)


def _sign_in(user_id):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=user_id, **PROFILES[user_id]
    )


@pytest.fixture
def client(engine):
    """Alice follows Bob, Carol and Erin. Dave follows Alice, but Alice does not follow him."""
    app.dependency_overrides[get_engine] = lambda: engine
    client = TestClient(app)
    for user_id in PROFILES:
        _sign_in(user_id)
        assert client.get("/api/me").status_code == 200
    _sign_in(ALICE)
    for followee in (BOB, CAROL, ERIN):
        assert client.put(f"/api/follows/{followee}").status_code == 204
    _sign_in(DAVE)
    assert client.put(f"/api/follows/{ALICE}").status_code == 204
    yield client
    app.dependency_overrides.clear()


def _collection(client, user_id, is_public=True, name="Cafes"):
    _sign_in(user_id)
    res = client.post("/api/collections", json={"name": name, "is_public": is_public})
    assert res.status_code == 201
    return res.json()["id"]


def _save(client, user_id, place, is_public=True):
    """Save `place` into a new collection of `user_id`; returns the collection id."""
    collection_id = _collection(client, user_id, is_public)
    assert client.post(f"/api/collections/{collection_id}/places", json=place).status_code == 201
    return collection_id


def _save_at(engine, collection_id, place, minutes, **overrides):
    """Save a snapshot directly, at START + `minutes`, so that ordering is deterministic."""
    with Session(engine) as db:
        db.add(
            CollectionPlace(
                collection_id=uuid.UUID(collection_id),
                provider=place["provider"],
                provider_place_id=place["id"],
                name=overrides.get("name", place["name"]),
                address=overrides.get("address", place.get("address", "")),
                road_address=None,
                category=overrides.get("category", place.get("category")),
                phone=None,
                url=None,
                lat=place["lat"],
                lng=place["lng"],
                created_at=START + timedelta(minutes=minutes),
            )
        )
        db.commit()


def _popular(client, **params):
    _sign_in(ALICE)
    res = client.get("/api/places/popular", params=params)
    assert res.status_code == 200
    return res.json()


def _counts(client):
    return {place["name"]: place["saver_count"] for place in _popular(client)}


def test_requires_auth(client):
    app.dependency_overrides.pop(get_current_user)
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="https://example.supabase.co"
    )
    assert client.get("/api/places/popular").status_code == 401


def test_is_empty_when_nobody_followed_has_saved_anything(client):
    assert _popular(client) == []


def test_lists_a_place_with_the_details_and_savers(client):
    _save(client, BOB, CAFE)
    [place] = _popular(client)
    assert place["id"] == "1001"
    assert place["provider"] == "kakao"
    assert place["name"] == "Cafe Onion"
    assert place["category"] == "음식점 > 카페 > 커피전문점"
    assert place["saver_count"] == 1
    assert place["savers"] == [{"id": BOB, "name": "Bob Lee", "handle": "bob", "avatar_url": None}]
    assert place["saved_by_me"] is False
    assert place["last_saved_at"]


def test_counts_people_not_collections(client):
    _save(client, BOB, CAFE)
    _save(client, BOB, CAFE)
    _save(client, CAROL, CAFE)
    assert _counts(client) == {"Cafe Onion": 2}


def test_ranks_by_saver_count_then_most_recent_save(client, engine):
    bob = _collection(client, BOB)
    carol = _collection(client, CAROL)
    erin = _collection(client, ERIN)
    _save_at(engine, bob, CAFE, 1)
    _save_at(engine, carol, CAFE, 2)
    _save_at(engine, bob, BAKERY, 3)
    # Same count as Bakery but saved later, so it goes first.
    _save_at(engine, erin, PARK, 4)

    assert [place["name"] for place in _popular(client)] == ["Cafe Onion", "Seoul Forest", "Bakery"]


def test_leaves_out_private_collections(client):
    _save(client, BOB, CAFE, is_public=False)
    assert _popular(client) == []


def test_a_place_in_a_public_and_a_private_collection_counts_once(client):
    _save(client, BOB, CAFE, is_public=False)
    _save(client, BOB, CAFE)
    assert _counts(client) == {"Cafe Onion": 1}


def test_making_a_collection_private_takes_its_places_out(client):
    collection_id = _save(client, BOB, CAFE)
    _sign_in(BOB)
    client.patch(f"/api/collections/{collection_id}", json={"is_public": False})
    assert _popular(client) == []


def test_removed_places_and_deleted_collections_drop_out(client):
    kept = _save(client, BOB, CAFE)
    deleted = _save(client, CAROL, BAKERY)
    _sign_in(BOB)
    client.delete(f"/api/collections/{kept}/places/kakao/1001")
    _sign_in(CAROL)
    client.delete(f"/api/collections/{deleted}")
    assert _popular(client) == []


def test_leaves_out_users_not_followed_even_if_they_follow_me(client):
    _save(client, DAVE, CAFE)
    assert _popular(client) == []


def test_unfollowing_takes_their_saves_out(client):
    _save(client, BOB, CAFE)
    _sign_in(ALICE)
    client.delete(f"/api/follows/{BOB}")
    assert _popular(client) == []


def test_my_saves_are_flagged_but_not_counted(client):
    _save(client, ALICE, CAFE)
    _save(client, ALICE, BAKERY, is_public=False)
    _save(client, BOB, CAFE)
    _save(client, BOB, BAKERY)
    _save(client, BOB, PARK)

    places = {place["name"]: place for place in _popular(client)}
    assert {name: place["saver_count"] for name, place in places.items()} == {
        "Cafe Onion": 1,
        "Bakery": 1,
        "Seoul Forest": 1,
    }
    assert places["Cafe Onion"]["saved_by_me"] is True
    # Even a private collection of mine counts as having it.
    assert places["Bakery"]["saved_by_me"] is True
    assert places["Seoul Forest"]["saved_by_me"] is False


def test_lists_the_most_recent_three_savers_once_each(client, engine):
    collections = {user_id: _collection(client, user_id) for user_id in (BOB, CAROL, ERIN)}
    _save_at(engine, collections[CAROL], CAFE, 1)
    _save_at(engine, collections[ERIN], CAFE, 2)
    _save_at(engine, collections[BOB], CAFE, 3)
    # Bob again, in another collection: he is still listed once.
    _save_at(engine, _collection(client, BOB, name="More"), CAFE, 4)
    # A fourth saver, earlier than the rest: counted, but not listed.
    _sign_in(ALICE)
    client.put(f"/api/follows/{DAVE}")
    _save_at(engine, _collection(client, DAVE), CAFE, 0)

    [place] = _popular(client)
    assert place["saver_count"] == 4
    assert [saver["id"] for saver in place["savers"]] == [BOB, ERIN, CAROL]


def test_shows_the_details_most_savers_agree_on(client, engine):
    _save_at(engine, _collection(client, BOB), CAFE, 1)
    _save_at(engine, _collection(client, CAROL), CAFE, 2)
    # The newest snapshot alone says something else; it is outvoted.
    _save_at(engine, _collection(client, ERIN), CAFE, 3, name="Fake Name", category="술집")

    [place] = _popular(client)
    assert place["name"] == "Cafe Onion"
    assert place["category"] == "음식점 > 카페 > 커피전문점"


def test_honours_the_limit(client):
    _save(client, BOB, CAFE)
    _save(client, BOB, BAKERY)
    assert len(_popular(client, limit=1)) == 1
    _sign_in(ALICE)
    assert client.get("/api/places/popular", params={"limit": 0}).status_code == 422
    assert client.get("/api/places/popular", params={"limit": 51}).status_code == 422


def _snapshot(name, minutes=0):
    return CollectionPlace(
        provider="kakao",
        provider_place_id="1001",
        name=name,
        address="",
        lat=37.5,
        lng=127.0,
        created_at=START + timedelta(minutes=minutes),
    )


def test_representative_is_the_majority_snapshot():
    users = [uuid.uuid4() for _ in range(3)]
    newest_first = [
        (_snapshot("Edited"), users[0]),
        (_snapshot("Original"), users[1]),
        (_snapshot("Original"), users[2]),
    ]
    assert representative_snapshot(newest_first).name == "Original"


def test_representative_tie_goes_to_the_newest():
    users = [uuid.uuid4() for _ in range(2)]
    newest_first = [(_snapshot("Newer"), users[0]), (_snapshot("Older"), users[1])]
    assert representative_snapshot(newest_first).name == "Newer"


def test_representative_gives_each_user_one_vote():
    bob, carol = uuid.uuid4(), uuid.uuid4()
    newest_first = [
        (_snapshot("Carol's"), carol),
        (_snapshot("Bob's"), bob),
        (_snapshot("Bob's"), bob),
        (_snapshot("Bob's"), bob),
    ]
    # Bob saved it three times but votes once, so it is a tie and the newest wins.
    assert representative_snapshot(newest_first).name == "Carol's"


def test_representative_uses_each_users_latest_snapshot():
    bob, carol = uuid.uuid4(), uuid.uuid4()
    newest_first = [
        (_snapshot("Renamed"), bob),
        (_snapshot("Renamed"), carol),
        (_snapshot("Old"), bob),
    ]
    assert representative_snapshot(newest_first).name == "Renamed"
