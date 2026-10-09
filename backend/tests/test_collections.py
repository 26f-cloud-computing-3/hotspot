import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.db import Base, get_engine
from app.main import app

ALICE = str(uuid.uuid4())
BOB = str(uuid.uuid4())


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def client(engine):
    app.dependency_overrides[get_engine] = lambda: engine
    yield TestClient(app)
    app.dependency_overrides.clear()


def _sign_in(user_id):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=user_id)


def test_requires_auth(client):
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="https://example.supabase.co"
    )
    assert client.get("/api/collections").status_code == 401
    assert client.post("/api/collections", json={"name": "Cafes"}).status_code == 401


def test_create_defaults_to_private(client):
    _sign_in(ALICE)
    res = client.post("/api/collections", json={"name": "  Seoul cafes  "})
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Seoul cafes"
    assert body["is_public"] is False
    assert body["place_count"] == 0
    assert uuid.UUID(body["id"])
    assert body["created_at"]


def test_create_public(client):
    _sign_in(ALICE)
    res = client.post("/api/collections", json={"name": "Date spots", "is_public": True})
    assert res.status_code == 201
    assert res.json()["is_public"] is True


@pytest.mark.parametrize("name", ["", "   ", "x" * 51])
def test_create_rejects_invalid_name(client, name):
    _sign_in(ALICE)
    assert client.post("/api/collections", json={"name": name}).status_code == 422


def test_list_returns_only_own_collections(client):
    _sign_in(BOB)
    client.post("/api/collections", json={"name": "Bob's", "is_public": True})
    _sign_in(ALICE)
    client.post("/api/collections", json={"name": "Alice's"})

    res = client.get("/api/collections")
    assert res.status_code == 200
    assert [c["name"] for c in res.json()] == ["Alice's"]


def test_list_is_empty_for_new_user(client):
    _sign_in(ALICE)
    assert client.get("/api/collections").json() == []


def test_database_not_configured():
    _sign_in(ALICE)
    app.dependency_overrides[get_settings] = lambda: Settings(database_url="")
    try:
        assert TestClient(app).get("/api/collections").status_code == 503
    finally:
        app.dependency_overrides.clear()
