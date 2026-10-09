import uuid
from datetime import datetime

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Collection(Base):
    __tablename__ = "collection"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # References public."user"(id); the constraint lives in the SQL migration.
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    name: Mapped[str]
    is_public: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
