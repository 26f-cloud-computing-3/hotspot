import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.db import Base
from app.main import app  # noqa: F401  (imports every model so create_all sees them)


@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()
