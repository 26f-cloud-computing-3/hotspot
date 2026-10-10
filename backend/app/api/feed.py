import base64
import binascii
import uuid
from datetime import datetime
from enum import StrEnum
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.users import get_registered_user
from app.models.collection import Collection
from app.models.collection_history import CollectionAction, CollectionHistory
from app.models.follow import Follow
from app.models.user import User

router = APIRouter(prefix="/api/feed", tags=["feed"])

DEFAULT_LIMIT = 20
MAX_LIMIT = 50


class FeedItemType(StrEnum):
    PLACE_ADDED = "place_added"
    PLACE_REMOVED = "place_removed"
    COLLECTION_ADDED = "collection_added"
    COLLECTION_RENAMED = "collection_renamed"
    COLLECTION_REMOVED = "collection_removed"


# History actions followers get to see. Unpublishing is left out on purpose: a collection
# going private is not announced, its activity just disappears from the feed.
_ITEM_TYPES = {
    CollectionAction.PLACE_ADDED: FeedItemType.PLACE_ADDED,
    CollectionAction.PLACE_REMOVED: FeedItemType.PLACE_REMOVED,
    CollectionAction.CREATED: FeedItemType.COLLECTION_ADDED,
    CollectionAction.PUBLISHED: FeedItemType.COLLECTION_ADDED,
    CollectionAction.RENAMED: FeedItemType.COLLECTION_RENAMED,
    CollectionAction.DELETED: FeedItemType.COLLECTION_REMOVED,
}


class FeedActor(BaseModel):
    id: uuid.UUID
    name: str
    handle: str
    avatar_url: str | None


class FeedItem(BaseModel):
    id: uuid.UUID
    type: FeedItemType
    actor: FeedActor
    # Null once the collection is deleted.
    collection_id: uuid.UUID | None
    # The collection's name when the activity happened (the new name for a rename).
    collection_name: str
    place_name: str | None
    created_at: datetime


class FeedPage(BaseModel):
    items: list[FeedItem]
    # Pass back as ?continuation= to get the next (older) page; null on the last page.
    continuation: str | None


def _encode_continuation(row: CollectionHistory) -> str:
    return base64.urlsafe_b64encode(f"{row.created_at.isoformat()}|{row.id}".encode()).decode()


def _decode_continuation(token: str) -> tuple[datetime, uuid.UUID]:
    try:
        created_at, _, row_id = base64.urlsafe_b64decode(token).decode().partition("|")
        return datetime.fromisoformat(created_at), uuid.UUID(row_id)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid continuation") from exc


@router.get("")
def get_feed(
    continuation: str | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> FeedPage:
    """Activity of the users the signed-in user follows on their public collections, newest first.

    A row is shown only if the collection was public when it happened and still is, so making
    a collection private hides its earlier activity too. Deleting a public collection is the
    one activity shown without a live collection.
    """
    stmt = (
        select(CollectionHistory, User)
        .join(Follow, Follow.followee_id == CollectionHistory.actor_id)
        .join(User, User.id == CollectionHistory.actor_id)
        .outerjoin(Collection, Collection.id == CollectionHistory.collection_id)
        .where(
            Follow.follower_id == user.id,
            CollectionHistory.is_public,
            CollectionHistory.action.in_(_ITEM_TYPES),
            or_(CollectionHistory.action == CollectionAction.DELETED, Collection.is_public),
        )
        .order_by(CollectionHistory.created_at.desc(), CollectionHistory.id.desc())
        # One extra row tells whether there is a next page.
        .limit(limit + 1)
    )
    if continuation is not None:
        created_at, row_id = _decode_continuation(continuation)
        stmt = stmt.where(
            or_(
                CollectionHistory.created_at < created_at,
                and_(CollectionHistory.created_at == created_at, CollectionHistory.id < row_id),
            )
        )
    rows = db.execute(stmt).all()
    page = rows[:limit]
    return FeedPage(
        items=[
            FeedItem(
                id=row.id,
                type=_ITEM_TYPES[CollectionAction(row.action)],
                actor=FeedActor(
                    id=actor.id, name=actor.name, handle=actor.handle, avatar_url=actor.avatar_url
                ),
                collection_id=row.collection_id,
                collection_name=row.collection_name,
                place_name=row.place_name,
                created_at=row.created_at,
            )
            for row, actor in page
        ],
        continuation=_encode_continuation(page[-1][0]) if len(rows) > limit else None,
    )
