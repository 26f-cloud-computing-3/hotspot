import uuid
from datetime import datetime

from sqlalchemy import DateTime, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class CollectionPlace(Base):
    """A place saved into a collection, with a snapshot of the place taken at that time."""

    __tablename__ = "collection_place"
    __table_args__ = (UniqueConstraint("collection_id", "provider", "provider_place_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # References public.collection(id); the constraint lives in the SQL migration.
    collection_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    # The provider's own identifier; unique only together with `provider`.
    provider: Mapped[str]
    provider_place_id: Mapped[str]
    name: Mapped[str]
    address: Mapped[str] = mapped_column(default="")
    road_address: Mapped[str | None]
    category: Mapped[str | None]
    phone: Mapped[str | None]
    url: Mapped[str | None]
    lat: Mapped[float]
    lng: Mapped[float]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
