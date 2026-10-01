import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.core.auth import get_jwks_client
from app.core.config import Settings, get_settings
from app.main import app

SUPABASE_URL = "https://example.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"


class _SigningKey:
    def __init__(self, key):
        self.key = key


class _FakeJWKSClient:
    def __init__(self, public_key):
        self._public_key = public_key

    def get_signing_key_from_jwt(self, _token):
        return _SigningKey(self._public_key)


@pytest.fixture(scope="module")
def private_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def client(private_key):
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_url=SUPABASE_URL)
    app.dependency_overrides[get_jwks_client] = lambda: _FakeJWKSClient(private_key.public_key())
    yield TestClient(app)
    app.dependency_overrides.clear()


def _token(private_key, **overrides):
    claims = {
        "sub": "user-123",
        "email": "a@example.com",
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": int(time.time()) + 60,
    } | overrides
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, private_key, algorithm="RS256")


def _get_me(client, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.get("/api/me", headers=headers)


def test_valid_token(client, private_key):
    res = _get_me(client, _token(private_key))
    assert res.status_code == 200
    assert res.json() == {"id": "user-123", "email": "a@example.com"}


def test_missing_header(client):
    assert _get_me(client).status_code == 401


def test_expired_token(client, private_key):
    assert _get_me(client, _token(private_key, exp=int(time.time()) - 10)).status_code == 401


def test_wrong_audience(client, private_key):
    assert _get_me(client, _token(private_key, aud="anon")).status_code == 401


def test_wrong_issuer(client, private_key):
    assert (
        _get_me(client, _token(private_key, iss="https://evil.example/auth/v1")).status_code == 401
    )


def test_bad_signature(client):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert _get_me(client, _token(other)).status_code == 401


def test_auth_not_configured():
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_url="")
    try:
        assert TestClient(app).get("/api/me").status_code == 503
    finally:
        app.dependency_overrides.clear()
