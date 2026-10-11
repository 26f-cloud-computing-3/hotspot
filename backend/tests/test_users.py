import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.db import get_engine
from app.main import app
from app.models.user import User

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())


@pytest.fixture
def client(engine):
    app.dependency_overrides[get_engine] = lambda: engine
    yield TestClient(app)
    app.dependency_overrides.clear()


def _sign_in(user_id, **profile):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=user_id, **profile)


def _rows(engine):
    with Session(engine) as db:
        return db.scalars(select(User)).all()


def test_first_request_creates_user_row(client, engine):
    _sign_in(ALICE, email="Alice.Kim@example.com", name="Alice Kim", avatar_url="https://a/p.png")
    res = client.get("/api/me")
    assert res.status_code == 200
    assert res.json() == {
        "id": ALICE,
        "email": "Alice.Kim@example.com",
        "name": "Alice Kim",
        "handle": "alicekim",
        "avatar_url": "https://a/p.png",
    }
    assert [str(row.id) for row in _rows(engine)] == [ALICE]


def test_later_requests_follow_only_the_google_avatar(client, engine):
    _sign_in(ALICE, email="alice@example.com", name="Alice", avatar_url="https://a/old.png")
    client.get("/api/me")
    _sign_in(ALICE, email="other@example.com", name="Renamed", avatar_url="https://a/new.png")
    body = client.get("/api/me").json()
    # The name and handle are the user's own to edit, so they do not follow Google.
    assert (body["name"], body["handle"]) == ("Alice", "alice")
    assert body["avatar_url"] == "https://a/new.png"
    assert len(_rows(engine)) == 1


def test_missing_avatar_keeps_the_stored_one(client):
    _sign_in(ALICE, email="alice@example.com", name="Alice", avatar_url="https://a/p.png")
    client.get("/api/me")
    _sign_in(ALICE, email="alice@example.com")
    assert client.get("/api/me").json()["avatar_url"] == "https://a/p.png"


def test_taken_handle_gets_a_suffix(client, engine):
    _sign_in(ALICE, email="sam@example.com")
    assert client.get("/api/me").json()["handle"] == "sam"
    _sign_in(BOB, email="sam@other.example")
    handle = client.get("/api/me").json()["handle"]
    assert handle.startswith("sam") and len(handle) == len("sam") + 4


def test_falls_back_when_profile_is_missing(client):
    _sign_in(ALICE)
    body = client.get("/api/me").json()
    assert (body["name"], body["handle"], body["avatar_url"]) == ("user", "user", None)


def test_creating_a_collection_creates_the_user_row(client, engine):
    _sign_in(ALICE, email="alice@example.com")
    assert client.post("/api/collections", json={"name": "Cafes"}).status_code == 201
    assert [row.handle for row in _rows(engine)] == ["alice"]


def test_update_me_changes_name_and_handle(client, engine):
    _sign_in(ALICE, email="alice@example.com", name="Alice")
    res = client.patch("/api/me", json={"name": "  Alice Kim ", "handle": " Alice_K "})
    assert res.status_code == 200
    assert (res.json()["name"], res.json()["handle"]) == ("Alice Kim", "alice_k")
    # The edit survives later requests that still carry the Google name.
    body = client.get("/api/me").json()
    assert (body["name"], body["handle"], body["email"]) == (
        "Alice Kim",
        "alice_k",
        "alice@example.com",
    )


def test_update_me_changes_only_sent_fields(client):
    _sign_in(ALICE, email="alice@example.com", name="Alice")
    body = client.patch("/api/me", json={"name": "Renamed"}).json()
    assert (body["name"], body["handle"]) == ("Renamed", "alice")
    body = client.patch("/api/me", json={"handle": "renamed"}).json()
    assert (body["name"], body["handle"]) == ("Renamed", "renamed")


def test_update_me_rejects_a_taken_handle(client):
    _sign_in(BOB, email="bob@example.com")
    client.get("/api/me")
    _sign_in(ALICE, email="alice@example.com")
    assert client.patch("/api/me", json={"handle": "BOB"}).status_code == 409
    assert client.get("/api/me").json()["handle"] == "alice"


def test_update_me_accepts_the_current_handle(client):
    # Re-sending my own handle is not a conflict with myself.
    _sign_in(ALICE, email="alice@example.com")
    res = client.patch("/api/me", json={"name": "Alice", "handle": "alice"})
    assert res.status_code == 200


@pytest.mark.parametrize(
    "fields",
    [
        {"name": "   "},
        {"name": "a" * 51},
        {"handle": "ab"},
        {"handle": "a" * 31},
        {"handle": "al ice"},
        {"handle": "@alice"},
        {"handle": "앨리스"},
    ],
)
def test_update_me_rejects_invalid_fields(client, fields):
    _sign_in(ALICE, email="alice@example.com", name="Alice")
    assert client.patch("/api/me", json=fields).status_code == 422
    body = client.get("/api/me").json()
    assert (body["name"], body["handle"]) == ("Alice", "alice")
