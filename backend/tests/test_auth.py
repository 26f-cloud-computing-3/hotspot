import time

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.api.map import get_provider
from app.core.auth import get_jwks_client
from app.core.config import Settings, get_settings
from app.core.db import get_engine
from app.core.map_provider import KakaoMapProvider
from app.main import app

SUPABASE_URL = "https://example.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
USER_ID = "3f2b8c1e-7d4a-4e0b-9a6c-5d1f2e3a4b5c"


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
def client(private_key, engine):
    app.dependency_overrides[get_settings] = lambda: Settings(supabase_url=SUPABASE_URL)
    app.dependency_overrides[get_engine] = lambda: engine
    app.dependency_overrides[get_jwks_client] = lambda: _FakeJWKSClient(private_key.public_key())
    yield TestClient(app)
    app.dependency_overrides.clear()


def _token(private_key, **overrides):
    claims = {
        "sub": USER_ID,
        "user_metadata": {"full_name": "A Person", "avatar_url": "https://a/p.png"},
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
    assert res.json() == {
        "id": USER_ID,
        "email": "a@example.com",
        "name": "A Person",
        "handle": "a",
        "avatar_url": "https://a/p.png",
    }


def test_non_uuid_subject(client, private_key):
    assert _get_me(client, _token(private_key, sub="not-a-uuid")).status_code == 401


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


@pytest.fixture
def kakao_requests(client):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "meta": {"pageable_count": 0, "is_end": True},
                "documents": [],
            },
        )

    app.dependency_overrides[get_provider] = lambda: KakaoMapProvider(
        "test-key", transport=httpx.MockTransport(handler)
    )
    yield requests
    app.dependency_overrides.pop(get_provider, None)


@pytest.mark.parametrize(
    "case", ["missing", "malformed", "expired", "signature", "audience", "issuer"]
)
def test_search_rejects_unauthenticated_without_calling_kakao(
    client, private_key, kakao_requests, case
):
    tokens = {
        "missing": None,
        "malformed": "invalid-token",
        "expired": _token(private_key, exp=int(time.time()) - 10),
        "signature": _token(rsa.generate_private_key(public_exponent=65537, key_size=2048)),
        "audience": _token(private_key, aud="anon"),
        "issuer": _token(private_key, iss="https://evil.example/auth/v1"),
    }
    token = tokens[case]
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = client.get("/api/map/search", params={"query": "카페"}, headers=headers)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert kakao_requests == []


def test_search_accepts_valid_token(client, private_key, kakao_requests):
    response = client.get(
        "/api/map/search",
        params={"query": "카페", "page": 2, "size": 5},
        headers={"Authorization": f"Bearer {_token(private_key)}"},
    )
    assert response.status_code == 200
    assert response.json() == {"places": [], "page": 2, "size": 5, "total": 0, "has_next": False}
    assert len(kakao_requests) == 1
    assert dict(kakao_requests[0].url.params) == {
        "query": "카페",
        "page": "2",
        "size": "5",
        "sort": "accuracy",
    }


def test_map_config_remains_public():
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="", map_provider="kakao", kakao_map_js_key="public-sdk-key"
    )
    try:
        response = TestClient(app).get("/api/map/config")
        assert response.status_code == 200
        assert response.json() == {"provider": "kakao", "client_key": "public-sdk-key"}
    finally:
        app.dependency_overrides.clear()
