from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import get_current_user
from app.core.config import Settings, get_settings
from app.core.map_provider import (
    MapProvider,
    MapProviderError,
    MapProviderNotConfiguredError,
    PlaceSearchResult,
    SortOrder,
    get_map_provider,
)

router = APIRouter(prefix="/api/map", tags=["map"])


def get_provider(settings: Settings = Depends(get_settings)) -> MapProvider:
    return get_map_provider(settings)


@router.get("/config")
def get_map_config(settings: Settings = Depends(get_settings)) -> dict:
    """Public config the frontend needs to initialize the map SDK.

    Only ever returns the client-safe key for the active provider, never the
    server-side secrets (e.g. Kakao REST key, Naver client secret).
    """
    provider = settings.map_provider
    js_keys = {
        "kakao": settings.kakao_map_js_key,
        "naver": settings.naver_map_client_id,
        "google": settings.google_maps_api_key,
    }
    return {"provider": provider, "client_key": js_keys.get(provider, "")}


@router.get("/search", dependencies=[Depends(get_current_user)])
async def search_places(
    query: str = Query(min_length=1, max_length=100, description="Place name or region"),
    lat: float | None = Query(None, ge=-90, le=90, description="Search center latitude"),
    lng: float | None = Query(None, ge=-180, le=180, description="Search center longitude"),
    radius: int | None = Query(
        None, ge=1, le=20000, description="Restrict results to this many meters from the center"
    ),
    sort: SortOrder = Query("accuracy"),
    page: int = Query(1, ge=1, le=45),
    size: int = Query(15, ge=1, le=15),
    provider: MapProvider = Depends(get_provider),
) -> PlaceSearchResult:
    """Search places via the active map provider."""
    query = query.strip()
    if not query:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "query must not be blank")
    if (lat is None) != (lng is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "lat and lng must be given together"
        )
    if lat is None and (radius is not None or sort == "distance"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "radius and sort=distance require lat and lng"
        )

    try:
        return await provider.search_places(
            query, lat=lat, lng=lng, radius=radius, sort=sort, page=page, size=size
        )
    except NotImplementedError as exc:
        raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, str(exc)) from exc
    except MapProviderNotConfiguredError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Map provider is not configured"
        ) from exc
    except MapProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Map provider request failed") from exc
