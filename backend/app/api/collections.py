import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.db import get_db
from app.models.collection import Collection
from app.models.collection_history import CollectionAction, CollectionHistory

router = APIRouter(prefix="/api/collections", tags=["collections"])

CollectionName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)
]


class CollectionCreate(BaseModel):
    name: CollectionName
    is_public: bool = False


class CollectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_public: bool
    # Saving places into a collection is not implemented yet, so this is always 0.
    place_count: int = Field(default=0)
    created_at: datetime


@router.get("")
def list_my_collections(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CollectionOut]:
    """List the signed-in user's collections, newest first."""
    rows = db.scalars(
        select(Collection)
        .where(Collection.owner_id == uuid.UUID(user.id))
        .order_by(Collection.created_at.desc(), Collection.id)
    )
    return [CollectionOut.model_validate(row) for row in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_collection(
    body: CollectionCreate,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CollectionOut:
    """Create a collection owned by the signed-in user (private unless stated otherwise)."""
    collection = Collection(owner_id=uuid.UUID(user.id), name=body.name, is_public=body.is_public)
    db.add(collection)
    db.flush()
    db.add(
        CollectionHistory(
            actor_id=collection.owner_id,
            collection_id=collection.id,
            action=CollectionAction.CREATED,
            collection_name=collection.name,
            is_public=collection.is_public,
        )
    )
    db.commit()
    db.refresh(collection)
    return CollectionOut.model_validate(collection)
