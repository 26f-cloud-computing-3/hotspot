import uuid
from datetime import datetime

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Follow(Base):
    """One-way follow: follower_id follows followee_id."""

    __tablename__ = "follow"

    # Both reference public."user"(id); the constraints live in the SQL migration.
    follower_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    followee_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
