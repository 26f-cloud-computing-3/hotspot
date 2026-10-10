import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_engine
from app.main import app
from app.models.follow import Follow

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())
CAROL = str(uuid.uuid4())

PROFILES = {
    ALICE: {"email": "alice@example.com", "name": "Alice Kim"},
    BOB: {"email": "bob@example.com", "name": "Bob Lee"},
    CAROL: {"email": "carol_99@example.com", "name": "Carol Kim"},
}


def _sign_in(user_id):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=user_id, **PROFILES.get(user_id, {})
    )


@pytest.fixture
def client(engine):
    """A client whose database already holds Alice, Bob and Carol."""
    app.dependency_overrides[get_engine] = lambda: engine
    client = TestClient(app)
    for user_id in PROFILES:
        _sign_in(user_id)
        assert client.get("/api/me").status_code == 200
    yield client
    app.dependency_overrides.clear()


def _handles(res):
    assert res.status_code == 200
    return [(user["handle"], user["is_following"]) for user in res.json()]


def test_requires_auth(client):
    app.dependency_overrides.pop(get_current_user)
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="https://example.supabase.co"
    )
    assert client.get("/api/users?q=a").status_code == 401
    assert client.get("/api/follows/following").status_code == 401
    assert client.get("/api/follows/followers").status_code == 401
    assert client.put(f"/api/follows/{BOB}").status_code == 401
    assert client.delete(f"/api/follows/{BOB}").status_code == 401


def test_follow_shows_up_on_both_sides(client):
    _sign_in(ALICE)
    assert client.put(f"/api/follows/{BOB}").status_code == 204
    assert _handles(client.get("/api/follows/following")) == [("bob", True)]
    assert _handles(client.get("/api/follows/followers")) == []

    _sign_in(BOB)
    assert _handles(client.get("/api/follows/following")) == []
    # Bob has not followed Alice back.
    assert _handles(client.get("/api/follows/followers")) == [("alice", False)]


def test_followers_report_follow_back(client):
    _sign_in(ALICE)
    client.put(f"/api/follows/{BOB}")
    _sign_in(BOB)
    client.put(f"/api/follows/{ALICE}")
    assert _handles(client.get("/api/follows/followers")) == [("alice", True)]


def test_lists_only_cover_the_signed_in_user(client):
    _sign_in(BOB)
    client.put(f"/api/follows/{CAROL}")
    _sign_in(ALICE)
    assert _handles(client.get("/api/follows/following")) == []
    assert _handles(client.get("/api/follows/followers")) == []


def test_follow_is_idempotent(client, engine):
    _sign_in(ALICE)
    assert client.put(f"/api/follows/{BOB}").status_code == 204
    assert client.put(f"/api/follows/{BOB}").status_code == 204
    with Session(engine) as db:
        rows = db.scalars(select(Follow)).all()
    assert [(str(r.follower_id), str(r.followee_id)) for r in rows] == [(ALICE, BOB)]


def test_unfollow(client):
    _sign_in(ALICE)
    client.put(f"/api/follows/{BOB}")
    client.put(f"/api/follows/{CAROL}")
    assert client.delete(f"/api/follows/{BOB}").status_code == 204
    assert _handles(client.get("/api/follows/following")) == [("carol_99", True)]
    # Unfollowing again, or someone never followed, changes nothing.
    assert client.delete(f"/api/follows/{BOB}").status_code == 204
    assert client.delete(f"/api/follows/{uuid.uuid4()}").status_code == 204


def test_unfollow_does_not_remove_the_other_direction(client):
    _sign_in(BOB)
    client.put(f"/api/follows/{ALICE}")
    _sign_in(ALICE)
    client.put(f"/api/follows/{BOB}")
    client.delete(f"/api/follows/{BOB}")
    assert _handles(client.get("/api/follows/followers")) == [("bob", False)]


def test_cannot_follow_yourself(client):
    _sign_in(ALICE)
    assert client.put(f"/api/follows/{ALICE}").status_code == 400


def test_cannot_follow_unknown_user(client):
    _sign_in(ALICE)
    assert client.put(f"/api/follows/{uuid.uuid4()}").status_code == 404
    assert client.put("/api/follows/not-a-uuid").status_code == 422


def test_search_matches_handle_prefix_and_name(client):
    _sign_in(ALICE)
    client.put(f"/api/follows/{CAROL}")
    # "kim" is in Alice's and Carol's names; the searcher is left out.
    assert _handles(client.get("/api/users?q=KIM")) == [("carol_99", True)]
    assert _handles(client.get("/api/users?q=@bo")) == [("bob", False)]
    # Handles match from the start only.
    assert _handles(client.get("/api/users?q=arol_9")) == []


def test_search_treats_wildcards_literally(client):
    _sign_in(ALICE)
    assert _handles(client.get("/api/users?q=%25")) == []
    assert _handles(client.get("/api/users?q=carol_")) == [("carol_99", False)]
    assert _handles(client.get("/api/users?q=c_rol")) == []


def test_search_needs_a_term(client):
    _sign_in(ALICE)
    assert _handles(client.get("/api/users?q=%20%20")) == []
    assert client.get("/api/users").status_code == 422
