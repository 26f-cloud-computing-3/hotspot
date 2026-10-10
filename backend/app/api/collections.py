import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, StringConstraints, field_validator
from sqlalchemy import delete, func, literal, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.users import get_registered_user
from app.models.collection import Collection
from app.models.collection_history import CollectionAction, CollectionHistory
from app.models.collection_place import CollectionPlace
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
    id: uuid.UUID
    name: str
    is_public: bool
    place_count: int
    # Whether the place named in the list query is in this collection; null when none was named.
    contains_place: bool | None = None
    created_at: datetime


class CollectionPlaceIn(BaseModel):
    """A place as the place search returned it; fields it does not list (distance) are ignored.

    The backend cannot check these values against the map provider, so they are only
    bounded here and stored as the saving user's own snapshot.
    """

    id: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    provider: Literal["kakao", "naver", "google"]
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    address: Annotated[str, StringConstraints(max_length=300)] = ""
    road_address: Annotated[str, StringConstraints(max_length=300)] | None = None
    category: Annotated[str, StringConstraints(max_length=200)] | None = None
    phone: Annotated[str, StringConstraints(max_length=50)] | None = None
    url: Annotated[str, StringConstraints(max_length=500)] | None = None
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)

    @field_validator("url")
    @classmethod
    def _url_is_http(cls, value: str | None) -> str | None:
        # The frontend renders this as a link, so schemes like javascript: must not get in.
        if value is not None and not value.startswith(("http://", "https://")):
            raise ValueError("url must start with http:// or https://")
        return value


class CollectionPlaceOut(BaseModel):
    """Same shape as a place search result, so the frontend can treat both alike."""

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
    added_at: datetime


@router.get("")
def list_my_collections(
    provider: str | None = None,
    place_id: str | None = None,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> list[CollectionOut]:
    """List the signed-in user's collections, newest first.

    Pass `provider` and `place_id` together to also learn which of them contain that place.
    """
    if (provider is None) != (place_id is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "provider and place_id must be given together",
        )

    place_count = (
        select(func.count())
        .select_from(CollectionPlace)
        .where(CollectionPlace.collection_id == Collection.id)
        .scalar_subquery()
    )
    contains_place = (
        literal(None)
        if provider is None
        else select(CollectionPlace.id)
        .where(
            CollectionPlace.collection_id == Collection.id,
            CollectionPlace.provider == provider,
            CollectionPlace.provider_place_id == place_id,
        )
        .exists()
    )
    rows = db.execute(
        select(Collection, place_count, contains_place)
        .where(Collection.owner_id == user.id)
        .order_by(Collection.created_at.desc(), Collection.id)
    )
    return [_collection_out(collection, count, contains) for collection, count, contains in rows]


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
    return _collection_out(collection, 0)


@router.get("/{collection_id}")
def get_collection(
    collection_id: uuid.UUID,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> CollectionOut:
    """Return one of the signed-in user's collections."""
    collection = _get_own_collection(db, user, collection_id)
    return _collection_out(collection, _count_places(db, collection))


@router.patch("/{collection_id}")
def update_collection(
    collection_id: uuid.UUID,
    body: CollectionUpdate,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> CollectionOut:
    """Rename the signed-in user's collection and/or change its visibility."""
    collection = _get_own_collection(db, user, collection_id)

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
    return _collection_out(collection, _count_places(db, collection))


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    collection_id: uuid.UUID,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete the signed-in user's collection. Its history rows stay, with collection_id nulled."""
    collection = _get_own_collection(db, user, collection_id)
    # Recorded before the delete so the row snapshots the collection's last name and visibility;
    # the database then sets its collection_id to null along with the earlier rows.
    _record_history(db, collection, CollectionAction.DELETED)
    # Flush first: the history row references the collection, so it must be inserted before the
    # DELETE runs (the ORM doesn't know about the foreign key and won't order them itself).
    db.flush()
    db.delete(collection)
    db.commit()


@router.get("/{collection_id}/places")
def list_collection_places(
    collection_id: uuid.UUID,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> list[CollectionPlaceOut]:
    """List the places in the signed-in user's collection, most recently added first."""
    collection = _get_own_collection(db, user, collection_id)
    rows = db.scalars(
        select(CollectionPlace)
        .where(CollectionPlace.collection_id == collection.id)
        .order_by(CollectionPlace.created_at.desc(), CollectionPlace.id)
    )
    return [_place_out(row) for row in rows]


@router.post("/{collection_id}/places", status_code=status.HTTP_201_CREATED)
def add_place(
    collection_id: uuid.UUID,
    body: CollectionPlaceIn,
    response: Response,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> CollectionPlaceOut:
    """Save a place into the signed-in user's collection.

    Saving a place that is already there succeeds with 200 and changes nothing: the stored
    snapshot is kept and no history is recorded.
    """
    collection = _get_own_collection(db, user, collection_id)
    place = _find_place(db, collection.id, body.provider, body.id)
    if place is None:
        place = CollectionPlace(
            collection_id=collection.id,
            provider=body.provider,
            provider_place_id=body.id,
            **body.model_dump(exclude={"id", "provider"}),
        )
        db.add(place)
        _record_history(db, collection, CollectionAction.PLACE_ADDED, place_name=place.name)
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request saved the same place (or deleted the collection) first.
            db.rollback()
            place = _find_place(db, collection_id, body.provider, body.id)
            if place is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found") from None
            response.status_code = status.HTTP_200_OK
        else:
            db.refresh(place)
    else:
        response.status_code = status.HTTP_200_OK
    return _place_out(place)


@router.delete(
    "/{collection_id}/places/{provider}/{place_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_place(
    collection_id: uuid.UUID,
    provider: str,
    place_id: str,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> None:
    """Remove a place from the signed-in user's collection.

    Removing a place that is not there succeeds too, without recording history.
    """
    collection = _get_own_collection(db, user, collection_id)
    place = _find_place(db, collection.id, provider, place_id)
    if place is None:
        return
    # Deleting by id and checking the row count keeps two concurrent removals from both
    # recording history.
    removed = db.execute(delete(CollectionPlace).where(CollectionPlace.id == place.id)).rowcount
    if removed:
        _record_history(db, collection, CollectionAction.PLACE_REMOVED, place_name=place.name)
    db.commit()


def _get_own_collection(db: Session, user: User, collection_id: uuid.UUID) -> Collection:
    collection = db.scalar(
        select(Collection).where(Collection.id == collection_id, Collection.owner_id == user.id)
    )
    # Someone else's collection is reported as missing so its existence isn't revealed.
    if collection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found")
    return collection


def _count_places(db: Session, collection: Collection) -> int:
    return db.scalar(
        select(func.count())
        .select_from(CollectionPlace)
        .where(CollectionPlace.collection_id == collection.id)
    )


def _find_place(
    db: Session, collection_id: uuid.UUID, provider: str, provider_place_id: str
) -> CollectionPlace | None:
    return db.scalar(
        select(CollectionPlace).where(
            CollectionPlace.collection_id == collection_id,
            CollectionPlace.provider == provider,
            CollectionPlace.provider_place_id == provider_place_id,
        )
    )


def _collection_out(
    collection: Collection, place_count: int, contains_place: bool | None = None
) -> CollectionOut:
    return CollectionOut(
        id=collection.id,
        name=collection.name,
        is_public=collection.is_public,
        place_count=place_count,
        contains_place=contains_place,
        created_at=collection.created_at,
    )


def _place_out(place: CollectionPlace) -> CollectionPlaceOut:
    return CollectionPlaceOut(
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
        added_at=place.created_at,
    )


def _record_history(
    db: Session,
    collection: Collection,
    action: CollectionAction,
    place_name: str | None = None,
) -> None:
    db.add(
        CollectionHistory(
            actor_id=collection.owner_id,
            collection_id=collection.id,
            action=action,
            collection_name=collection.name,
            is_public=collection.is_public,
            place_name=place_name,
        )
    )
