import uuid
from collections import Counter
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import Select, and_, distinct, func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.users import get_registered_user
from app.models.collection import Collection
from app.models.collection_place import CollectionPlace
from app.models.follow import Follow
from app.models.user import User

router = APIRouter(prefix="/api/places", tags=["places"])

DEFAULT_LIMIT = 20
MAX_LIMIT = 50
# How many of the users who saved a place are listed with it.
SAVERS_SHOWN = 3

PlaceKey = tuple[str, str]


class PlaceSaver(BaseModel):
    id: uuid.UUID
    name: str
    handle: str
    avatar_url: str | None


class PopularPlace(BaseModel):
    """A place search result's fields, plus who among the followed users saved it."""

    id: str
    provider: str
    name: str
    address: str
    road_address: str | None
    category: str | None
    phone: str | None
    url: str | None
    lat: float
    lng: float
    # Followed users who have it in a public collection; one user counts once.
    saver_count: int
    # The most recent savers first, at most SAVERS_SHOWN.
    savers: list[PlaceSaver]
    # Whether the signed-in user has it in any of their own collections, public or not.
    saved_by_me: bool
    last_saved_at: datetime


@router.get("/popular")
def list_popular_places(
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> list[PopularPlace]:
    """Places the users I follow keep in their public collections, saved by the most first.

    Only collections that are public now count, so making one private takes its places out
    at once. My own saves are not counted (one cannot follow oneself) but are flagged.
    Ties go to the place saved most recently.
    """
    saver_count = func.count(distinct(Collection.owner_id)).label("saver_count")
    last_saved_at = func.max(CollectionPlace.created_at).label("last_saved_at")
    ranked = db.execute(
        _followed_public_saves(
            select(
                CollectionPlace.provider,
                CollectionPlace.provider_place_id,
                saver_count,
                last_saved_at,
            ),
            user,
        )
        .group_by(CollectionPlace.provider, CollectionPlace.provider_place_id)
        .order_by(
            saver_count.desc(),
            last_saved_at.desc(),
            CollectionPlace.provider,
            CollectionPlace.provider_place_id,
        )
        .limit(limit)
    ).all()
    if not ranked:
        return []

    keys = [(row.provider, row.provider_place_id) for row in ranked]
    snapshots, savers = _snapshots_and_savers(db, user, keys)
    saved_by_me = _saved_by(db, user, keys)
    popular = []
    for row, key in zip(ranked, keys, strict=True):
        place = representative_snapshot(snapshots[key])
        popular.append(
            PopularPlace(
                id=place.provider_place_id,
                provider=place.provider,
                name=place.name,
                address=place.address,
                road_address=place.road_address,
                category=place.category,
                phone=place.phone,
                url=place.url,
                lat=place.lat,
                lng=place.lng,
                saver_count=row.saver_count,
                savers=[
                    PlaceSaver(
                        id=saver.id,
                        name=saver.name,
                        handle=saver.handle,
                        avatar_url=saver.avatar_url,
                    )
                    for saver in savers[key]
                ],
                saved_by_me=key in saved_by_me,
                last_saved_at=row.last_saved_at,
            )
        )
    return popular


def representative_snapshot(snapshots: list[tuple[CollectionPlace, uuid.UUID]]) -> CollectionPlace:
    """The snapshot to show for a place, given its (snapshot, saving user) pairs newest first.

    The backend cannot check what clients send for a place, so the details most savers agree
    on win and a few edited snapshots are outvoted. A whole snapshot is picked rather than each
    field on its own, so the name and the address shown always come from the same save.
    Each user votes once, with their latest snapshot, so saving a place into many collections
    does not outvote the others. Ties go to the most recent snapshot.
    """
    latest_per_user: dict[uuid.UUID, CollectionPlace] = {}
    for snapshot, owner_id in snapshots:
        latest_per_user.setdefault(owner_id, snapshot)
    ballots = list(latest_per_user.values())
    votes = Counter(_snapshot_values(snapshot) for snapshot in ballots)
    # max() keeps the first of equals, and the ballots are newest first.
    return max(ballots, key=lambda snapshot: votes[_snapshot_values(snapshot)])


def _snapshot_values(place: CollectionPlace) -> tuple:
    return (
        place.name,
        place.address,
        place.road_address,
        place.category,
        place.phone,
        place.url,
        place.lat,
        place.lng,
    )


def _followed_public_saves(stmt: Select, user: User) -> Select:
    """Narrow `stmt` to places saved in public collections of the users `user` follows."""
    return (
        stmt.join(Collection, Collection.id == CollectionPlace.collection_id)
        .join(Follow, Follow.followee_id == Collection.owner_id)
        .where(Follow.follower_id == user.id, Collection.is_public)
    )


def _is_one_of(keys: list[PlaceKey]):
    return or_(
        *(
            and_(
                CollectionPlace.provider == provider, CollectionPlace.provider_place_id == place_id
            )
            for provider, place_id in keys
        )
    )


def _snapshots_and_savers(
    db: Session, user: User, keys: list[PlaceKey]
) -> tuple[dict[PlaceKey, list[tuple[CollectionPlace, uuid.UUID]]], dict[PlaceKey, list[User]]]:
    """Each place's snapshots newest first, and its most recent distinct savers."""
    snapshots: dict[PlaceKey, list[tuple[CollectionPlace, uuid.UUID]]] = {}
    savers: dict[PlaceKey, list[User]] = {}
    rows = db.execute(
        _followed_public_saves(select(CollectionPlace, User), user)
        .join(User, User.id == Collection.owner_id)
        .where(_is_one_of(keys))
        .order_by(CollectionPlace.created_at.desc(), CollectionPlace.id)
    )
    for snapshot, owner in rows:
        key = (snapshot.provider, snapshot.provider_place_id)
        snapshots.setdefault(key, []).append((snapshot, owner.id))
        place_savers = savers.setdefault(key, [])
        if len(place_savers) < SAVERS_SHOWN and owner not in place_savers:
            place_savers.append(owner)
    return snapshots, savers


def _saved_by(db: Session, user: User, keys: list[PlaceKey]) -> set[PlaceKey]:
    """Which of `keys` are in any of `user`'s own collections."""
    rows = db.execute(
        select(CollectionPlace.provider, CollectionPlace.provider_place_id)
        .join(Collection, Collection.id == CollectionPlace.collection_id)
        .where(Collection.owner_id == user.id, _is_one_of(keys))
        .distinct()
    )
    return {(provider, place_id) for provider, place_id in rows}
