from collections.abc import Iterator
from functools import lru_cache

from fastapi import Depends, HTTPException, status
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session

from app.core.config import Settings, get_settings


class Base(DeclarativeBase):
    """Base for ORM models. The schema itself is owned by supabase/migrations/*.sql."""


def _sqlalchemy_url(database_url: str) -> str:
    # Supabase hands out postgresql:// URIs; pin them to the psycopg 3 driver.
    for prefix in ("postgresql://", "postgres://"):
        if database_url.startswith(prefix):
            return "postgresql+psycopg://" + database_url.removeprefix(prefix)
    return database_url


@lru_cache
def _engine(database_url: str) -> Engine:
    return create_engine(
        _sqlalchemy_url(database_url),
        pool_pre_ping=True,
        # Supabase's transaction-mode pooler does not support prepared statements.
        connect_args={"prepare_threshold": None},
    )


def get_engine(settings: Settings = Depends(get_settings)) -> Engine:
    if not settings.database_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database is not configured")
    return _engine(settings.database_url)


def get_db(engine: Engine = Depends(get_engine)) -> Iterator[Session]:
    with Session(engine) as session:
        yield session
