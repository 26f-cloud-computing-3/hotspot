import uuid
from datetime import datetime

from sqlalchemy import DateTime, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SearchHistory(Base):
    """A place-search query a user ran; one row per distinct query."""

    __tablename__ = "search_history"
    __table_args__ = (UniqueConstraint("user_id", "query"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # References public."user"(id); the constraint lives in the SQL migration.
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    query: Mapped[str]
    # When the query was last searched; set by the API on every record.
    searched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
