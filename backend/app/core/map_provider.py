"""Map provider abstraction.

The frontend needs to search places / geocode addresses. Concrete providers
(Kakao, Naver, Google) implement the same interface so the active provider can
be swapped via `MAP_PROVIDER` without touching callers.
"""

from abc import ABC, abstractmethod
from typing import Literal

import httpx
from pydantic import BaseModel

from app.core.config import Settings

SortOrder = Literal["accuracy", "distance"]


class MapProviderError(Exception):
    """The upstream map provider failed or returned an unusable response."""


class MapProviderNotConfiguredError(MapProviderError):
    """The active provider has no server-side credentials configured."""


class Place(BaseModel):
    """A place result normalized across providers."""

    # Provider-scoped identifier; unique only together with `provider`.
    id: str
    provider: str
    name: str
    address: str
    road_address: str | None = None
    category: str | None = None
    phone: str | None = None
    url: str | None = None
    lat: float
    lng: float
    # Meters from the search center; only set when a center was given.
    distance: int | None = None


class PlaceSearchResult(BaseModel):
    places: list[Place]
    page: int
    size: int
    # Number of results reachable through pagination (providers cap this).
    total: int
    has_next: bool


class MapProvider(ABC):
    @abstractmethod
    async def search_places(
        self,
        query: str,
        *,
        lat: float | None = None,
        lng: float | None = None,
        radius: int | None = None,
        sort: SortOrder = "accuracy",
        page: int = 1,
        size: int = 15,
    ) -> PlaceSearchResult:
        """Search places matching a free-text query.

        `lat`/`lng` set the search center, `radius` (meters) restricts results
        to a circle around it, and `sort="distance"` orders by distance from it.
        """


class KakaoMapProvider(MapProvider):
    SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

    def __init__(
        self, rest_api_key: str, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._rest_api_key = rest_api_key
        self._transport = transport

    async def search_places(
        self,
        query: str,
        *,
        lat: float | None = None,
        lng: float | None = None,
        radius: int | None = None,
        sort: SortOrder = "accuracy",
        page: int = 1,
        size: int = 15,
    ) -> PlaceSearchResult:
        if not self._rest_api_key:
            raise MapProviderNotConfiguredError("KAKAO_MAP_REST_API_KEY is not set")

        params: dict[str, str | int | float] = {
            "query": query,
            "page": page,
            "size": size,
            "sort": sort,
        }
        if lat is not None and lng is not None:
            # Kakao uses x = longitude, y = latitude.
            params["x"] = lng
            params["y"] = lat
            if radius is not None:
                params["radius"] = radius

        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=5.0) as client:
                resp = await client.get(
                    self.SEARCH_URL,
                    params=params,
                    headers={"Authorization": f"KakaoAK {self._rest_api_key}"},
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise MapProviderError(
                f"Kakao place search failed with status {exc.response.status_code}"
            ) from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise MapProviderError("Kakao place search request failed") from exc

        # A 200 with an unexpected shape is still an upstream failure, not ours.
        try:
            meta = data.get("meta", {})
            return PlaceSearchResult(
                places=[self._to_place(doc) for doc in data.get("documents", [])],
                page=page,
                size=size,
                total=meta.get("pageable_count", 0),
                has_next=not meta.get("is_end", True),
            )
        except (AttributeError, KeyError, TypeError, ValueError) as exc:
            raise MapProviderError("Kakao place search returned an unexpected response") from exc

    @staticmethod
    def _to_place(doc: dict) -> Place:
        return Place(
            id=doc["id"],
            provider="kakao",
            name=doc["place_name"],
            address=doc.get("address_name", ""),
            road_address=doc.get("road_address_name") or None,
            category=doc.get("category_name") or None,
            phone=doc.get("phone") or None,
            url=doc.get("place_url") or None,
            lat=float(doc["y"]),
            lng=float(doc["x"]),
            distance=int(doc["distance"]) if doc.get("distance") else None,
        )


class NaverMapProvider(MapProvider):
    def __init__(self, client_id: str, client_secret: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret

    async def search_places(self, query: str, **kwargs) -> PlaceSearchResult:
        raise NotImplementedError("Naver Map provider not implemented yet")


class GoogleMapProvider(MapProvider):
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def search_places(self, query: str, **kwargs) -> PlaceSearchResult:
        raise NotImplementedError("Google Maps provider not implemented yet")


def get_map_provider(settings: Settings) -> MapProvider:
    if settings.map_provider == "kakao":
        return KakaoMapProvider(settings.kakao_map_rest_api_key)
    if settings.map_provider == "naver":
        return NaverMapProvider(settings.naver_map_client_id, settings.naver_map_client_secret)
    if settings.map_provider == "google":
        return GoogleMapProvider(settings.google_maps_api_key)
    raise ValueError(f"Unknown map provider: {settings.map_provider}")
