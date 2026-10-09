"""Map provider abstraction.

The frontend needs to search places / geocode addresses. Concrete providers
(Kakao, Naver, Google) implement the same interface so the active provider can
be swapped via `MAP_PROVIDER` without touching callers.
"""

from abc import ABC, abstractmethod
from typing import Any

import httpx

from app.core.config import Settings


class Place(dict[str, Any]):
    """A normalized place result: name, address, lat, lng."""


class MapProvider(ABC):
    @abstractmethod
    async def search_places(self, query: str) -> list[Place]:
        """Search places/addresses matching a free-text query."""


class KakaoMapProvider(MapProvider):
    SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

    def __init__(self, rest_api_key: str) -> None:
        self._rest_api_key = rest_api_key

    async def search_places(self, query: str) -> list[Place]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                self.SEARCH_URL,
                params={"query": query},
                headers={"Authorization": f"KakaoAK {self._rest_api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()

        return [
            Place(
                name=doc["place_name"],
                address=doc.get("road_address_name") or doc.get("address_name", ""),
                lat=float(doc["y"]),
                lng=float(doc["x"]),
            )
            for doc in data.get("documents", [])
        ]


class NaverMapProvider(MapProvider):
    def __init__(self, client_id: str, client_secret: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret

    async def search_places(self, query: str) -> list[Place]:
        raise NotImplementedError("Naver Map provider not implemented yet")


class GoogleMapProvider(MapProvider):
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def search_places(self, query: str) -> list[Place]:
        raise NotImplementedError("Google Maps provider not implemented yet")


def get_map_provider(settings: Settings) -> MapProvider:
    if settings.map_provider == "kakao":
        return KakaoMapProvider(settings.kakao_map_rest_api_key)
    if settings.map_provider == "naver":
        return NaverMapProvider(settings.naver_map_client_id, settings.naver_map_client_secret)
    if settings.map_provider == "google":
        return GoogleMapProvider(settings.google_maps_api_key)
    raise ValueError(f"Unknown map provider: {settings.map_provider}")
