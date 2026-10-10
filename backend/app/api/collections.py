import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.users import get_registered_user
from app.models.collection import Collection
from app.models.collection_history import CollectionAction, CollectionHistory
from app.models.user import User

router = APIRouter(prefix="/api/collections", tags=["collections"])

CollectionName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)
]


class CollectionCreate(BaseModel):
    name: CollectionName
    is_public: bool = False


class CollectionUpdate(BaseModel):
    """Fields left out (or sent as null) keep their current value."""

    name: CollectionName | None = None
    is_public: bool | None = None


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
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> list[CollectionOut]:
    """List the signed-in user's collections, newest first."""
    rows = db.scalars(
        select(Collection)
        .where(Collection.owner_id == user.id)
        .order_by(Collection.created_at.desc(), Collection.id)
    )
    return [CollectionOut.model_validate(row) for row in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_collection(
    body: CollectionCreate,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> CollectionOut:
    """Create a collection owned by the signed-in user (private unless stated otherwise)."""
    collection = Collection(owner_id=user.id, name=body.name, is_public=body.is_public)
    db.add(collection)
    db.flush()
    _record_history(db, collection, CollectionAction.CREATED)
    db.commit()
    db.refresh(collection)
    return CollectionOut.model_validate(collection)


@router.patch("/{collection_id}")
def update_collection(
    collection_id: uuid.UUID,
    body: CollectionUpdate,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> CollectionOut:
    """Rename the signed-in user's collection and/or change its visibility."""
    collection = db.scalar(
        select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id)
    )
    # Someone else's collection is reported as missing so its existence isn't revealed.
    if collection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found")

    # Each actual change gets its own history row; resending a current value records nothing.
    # The rename goes first so the visibility row's snapshot carries the new name.
    if body.name is not None and body.name != collection.name:
        collection.name = body.name
        _record_history(db, collection, CollectionAction.RENAMED)
    if body.is_public is not None and body.is_public != collection.is_public:
        collection.is_public = body.is_public
        _record_history(
            db,
            collection,
            CollectionAction.PUBLISHED if body.is_public else CollectionAction.UNPUBLISHED,
        )
    db.commit()
    db.refresh(collection)
    return CollectionOut.model_validate(collection)


def _record_history(db: Session, collection: Collection, action: CollectionAction) -> None:
    db.add(
        CollectionHistory(
            actor_id=collection.owner_id,
            collection_id=collection.id,
            action=action,
            collection_name=collection.name,
            is_public=collection.is_public,
        )
    )
