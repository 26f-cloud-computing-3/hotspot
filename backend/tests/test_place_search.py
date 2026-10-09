import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.map import get_provider
from app.core.map_provider import (
    KakaoMapProvider,
    MapProvider,
    MapProviderError,
    MapProviderNotConfiguredError,
    NaverMapProvider,
    Place,
    PlaceSearchResult,
)
from app.main import app

KAKAO_DOC = {
    "id": "8332362",
    "place_name": "성심당 본점",
    "category_name": "음식점 > 간식 > 제과,베이커리",
    "phone": "1588-8069",
    "address_name": "대전 중구 은행동 145-1",
    "road_address_name": "대전 중구 대종로480번길 15",
    "x": "127.427327",
    "y": "36.327683",
    "place_url": "http://place.map.kakao.com/8332362",
    "distance": "",
}


def _kakao(handler, key="rest-key"):
    return KakaoMapProvider(key, transport=httpx.MockTransport(handler))


def _kakao_response(docs, is_end=True, pageable_count=None):
    meta = {
        "total_count": len(docs),
        "pageable_count": len(docs) if pageable_count is None else pageable_count,
        "is_end": is_end,
    }
    return httpx.Response(200, json={"meta": meta, "documents": docs})


def test_kakao_normalizes_places():
    seen = {}

    def handler(request):
        seen["request"] = request
        return _kakao_response([KAKAO_DOC], is_end=False, pageable_count=45)

    result = asyncio.run(_kakao(handler).search_places("성심당", page=2, size=1))

    request = seen["request"]
    assert request.headers["Authorization"] == "KakaoAK rest-key"
    assert dict(request.url.params) == {
        "query": "성심당",
        "page": "2",
        "size": "1",
        "sort": "accuracy",
    }
    assert result == PlaceSearchResult(
        places=[
            Place(
                id="8332362",
                provider="kakao",
                name="성심당 본점",
                address="대전 중구 은행동 145-1",
                road_address="대전 중구 대종로480번길 15",
                category="음식점 > 간식 > 제과,베이커리",
                phone="1588-8069",
                url="http://place.map.kakao.com/8332362",
                lat=36.327683,
                lng=127.427327,
                distance=None,
            )
        ],
        page=2,
        size=1,
        total=45,
        has_next=True,
    )


def test_kakao_sends_search_center():
    seen = {}

    def handler(request):
        seen["params"] = dict(request.url.params)
        return _kakao_response([KAKAO_DOC | {"distance": "418", "road_address_name": ""}])

    result = asyncio.run(
        _kakao(handler).search_places(
            "카페", lat=36.3741, lng=127.3656, radius=1000, sort="distance"
        )
    )

    assert seen["params"] | {"query": "", "page": "", "size": ""} == {
        "query": "",
        "page": "",
        "size": "",
        "x": "127.3656",
        "y": "36.3741",
        "radius": "1000",
        "sort": "distance",
    }
    assert result.places[0].distance == 418
    assert result.places[0].road_address is None


def test_kakao_missing_key_is_not_configured():
    def handler(request):
        raise AssertionError("must not call Kakao without a key")

    with pytest.raises(MapProviderNotConfiguredError):
        asyncio.run(_kakao(handler, key="").search_places("성심당"))


def test_kakao_upstream_failures():
    def unauthorized(request):
        return httpx.Response(401, json={"errorType": "AccessDeniedError"})

    def unreachable(request):
        raise httpx.ConnectError("boom")

    for handler in (unauthorized, unreachable):
        with pytest.raises(MapProviderError):
            asyncio.run(_kakao(handler).search_places("성심당"))


@pytest.mark.parametrize(
    "body",
    [
        {"meta": {}, "documents": [KAKAO_DOC | {"y": "invalid"}]},
        {"meta": {}, "documents": [{k: v for k, v in KAKAO_DOC.items() if k != "place_name"}]},
        {"meta": {}, "documents": [KAKAO_DOC | {"place_name": None}]},
        {"meta": {"pageable_count": "many"}, "documents": []},
        {"meta": {}, "documents": ["not-a-doc"]},
        {"meta": {}, "documents": None},
        ["not", "an", "object"],
    ],
)
def test_kakao_malformed_response(body):
    def handler(request):
        return httpx.Response(200, json=body)

    with pytest.raises(MapProviderError):
        asyncio.run(_kakao(handler).search_places("성심당"))


def test_kakao_malformed_response_returns_502():
    def handler(request):
        return httpx.Response(200, json={"meta": {}, "documents": [KAKAO_DOC | {"y": "invalid"}]})

    app.dependency_overrides[get_provider] = lambda: _kakao(handler)
    try:
        res = TestClient(app).get("/api/map/search", params={"query": "성심당"})
        assert res.status_code == 502
    finally:
        app.dependency_overrides.clear()


class _FakeProvider(MapProvider):
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.calls = []

    async def search_places(self, query, **kwargs):
        self.calls.append((query, kwargs))
        if self.error:
            raise self.error
        return PlaceSearchResult(
            places=[
                Place(id="1", provider="fake", name="성심당", address="대전", lat=36.3, lng=127.4)
            ],
            page=kwargs["page"],
            size=kwargs["size"],
            total=1,
            has_next=False,
        )


@pytest.fixture
def provider():
    return _FakeProvider()


@pytest.fixture
def client(provider):
    app.dependency_overrides[get_provider] = lambda: provider
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_search_returns_places(client, provider):
    res = client.get("/api/map/search", params={"query": " 성심당 "})

    assert res.status_code == 200
    assert res.json() == {
        "places": [
            {
                "id": "1",
                "provider": "fake",
                "name": "성심당",
                "address": "대전",
                "road_address": None,
                "category": None,
                "phone": None,
                "url": None,
                "lat": 36.3,
                "lng": 127.4,
                "distance": None,
            }
        ],
        "page": 1,
        "size": 15,
        "total": 1,
        "has_next": False,
    }
    assert provider.calls == [
        (
            "성심당",
            {"lat": None, "lng": None, "radius": None, "sort": "accuracy", "page": 1, "size": 15},
        )
    ]


def test_search_passes_center_and_paging(client, provider):
    res = client.get(
        "/api/map/search",
        params={
            "query": "카페",
            "lat": 36.3741,
            "lng": 127.3656,
            "radius": 500,
            "sort": "distance",
            "page": 3,
            "size": 5,
        },
    )

    assert res.status_code == 200
    assert provider.calls[0][1] == {
        "lat": 36.3741,
        "lng": 127.3656,
        "radius": 500,
        "sort": "distance",
        "page": 3,
        "size": 5,
    }


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"query": ""},
        {"query": "   "},
        {"query": "x" * 101},
        {"query": "카페", "lat": 36.3},
        {"query": "카페", "lng": 127.3},
        {"query": "카페", "lat": 91, "lng": 127.3},
        {"query": "카페", "radius": 500},
        {"query": "카페", "sort": "distance"},
        {"query": "카페", "sort": "popular"},
        {"query": "카페", "page": 0},
        {"query": "카페", "page": 46},
        {"query": "카페", "size": 16},
        {"query": "카페", "lat": 36.3, "lng": 127.3, "radius": 20001},
    ],
)
def test_search_rejects_invalid_params(client, provider, params):
    assert client.get("/api/map/search", params=params).status_code == 422
    assert provider.calls == []


@pytest.mark.parametrize(
    ("error", "status_code"),
    [
        (MapProviderNotConfiguredError("no key"), 503),
        (MapProviderError("upstream 500"), 502),
        (NotImplementedError("not yet"), 501),
    ],
)
def test_search_maps_provider_errors(client, provider, error, status_code):
    provider.error = error
    assert client.get("/api/map/search", params={"query": "카페"}).status_code == status_code


def test_unimplemented_provider_returns_501():
    app.dependency_overrides[get_provider] = lambda: NaverMapProvider("id", "secret")
    try:
        res = TestClient(app).get("/api/map/search", params={"query": "카페"})
        assert res.status_code == 501
    finally:
        app.dependency_overrides.clear()
