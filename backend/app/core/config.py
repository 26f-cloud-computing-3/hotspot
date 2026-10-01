from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "backend"
    cors_origins: list[str] = ["http://localhost:5173"]

    # Map provider: "kakao" | "naver" | "google"
    map_provider: str = "kakao"

    # Kakao issues separate keys for server-side REST calls and the
    # browser-loaded JS SDK; never expose the REST key to the frontend.
    kakao_map_rest_api_key: str = ""
    kakao_map_js_key: str = ""

    naver_map_client_id: str = ""
    naver_map_client_secret: str = ""

    google_maps_api_key: str = ""

    # Supabase project URL, e.g. https://<ref>.supabase.co. Access tokens issued by
    # Supabase Auth are verified against its JWKS; no shared secret is needed.
    supabase_url: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
