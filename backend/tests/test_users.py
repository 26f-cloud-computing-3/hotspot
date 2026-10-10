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


def test_later_requests_follow_the_google_profile(client, engine):
    _sign_in(ALICE, email="alice@example.com", name="Alice", avatar_url="https://a/old.png")
    client.get("/api/me")
    _sign_in(ALICE, email="other@example.com", name="Renamed", avatar_url="https://a/new.png")
    body = client.get("/api/me").json()
    assert (body["name"], body["avatar_url"]) == ("Renamed", "https://a/new.png")
    # The handle identifies the user, so it does not follow the email.
    assert body["handle"] == "alice"
    assert len(_rows(engine)) == 1


def test_missing_profile_fields_keep_stored_values(client):
    _sign_in(ALICE, email="alice@example.com", name="Alice", avatar_url="https://a/p.png")
    client.get("/api/me")
    _sign_in(ALICE, email="alice@example.com")
    body = client.get("/api/me").json()
    assert (body["name"], body["avatar_url"]) == ("Alice", "https://a/p.png")


def test_existing_row_is_filled_in_from_the_token(client, engine):
    with Session(engine) as db:
        db.add(User(id=uuid.UUID(ALICE), name="placeholder", handle="custom", avatar_url=None))
        db.commit()
    _sign_in(ALICE, email="alice@example.com", name="Alice Kim", avatar_url="https://a/p.png")
    body = client.get("/api/me").json()
    assert (body["name"], body["handle"], body["avatar_url"]) == (
        "Alice Kim",
        "custom",
        "https://a/p.png",
    )


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

