import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class CollectionAction(StrEnum):
    CREATED = "collection_created"


class CollectionHistory(Base):
    """Append-only log of what users did to their collections; the feed is built from it."""

    __tablename__ = "collection_history"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # References public."user"(id); the constraint lives in the SQL migration.
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    # References public.collection(id), set to null once the collection is deleted.
    collection_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    action: Mapped[str]
    # Snapshots taken when the action happened, so a row stays readable after the
    # collection is renamed, deleted or has its visibility changed.
    collection_name: Mapped[str]
    is_public: Mapped[bool]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
