import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.db import get_db
from app.core.users import get_registered_user
from app.models.user import User

router = APIRouter(prefix="/api")

UserName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
# Handles made at signup come from the email address and may fall outside the length
# bounds; those stay valid until the user picks a new one.
UserHandle = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=3,
        max_length=30,
        pattern=r"^[A-Za-z0-9_]+$",
    ),
]


class Me(BaseModel):
    id: uuid.UUID
    email: str | None
    name: str
    handle: str
    avatar_url: str | None


class MeUpdate(BaseModel):
    """Fields left out (or sent as null) keep their current value."""

    name: UserName | None = None
    handle: UserHandle | None = None


def _me(user: CurrentUser, profile: User) -> Me:
    return Me(
        id=profile.id,
        email=user.email,
        name=profile.name,
        handle=profile.handle,
        avatar_url=profile.avatar_url,
    )


@router.get("/me")
def me(
    user: CurrentUser = Depends(get_current_user),
    profile: User = Depends(get_registered_user),
) -> Me:
    """The signed-in user's profile. Creates the user row on first call."""
    return _me(user, profile)


@router.patch("/me")
def update_me(
    body: MeUpdate,
    user: CurrentUser = Depends(get_current_user),
    profile: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> Me:
    """Change the signed-in user's name and/or handle. A handle someone else has is a 409."""
    taken = HTTPException(status.HTTP_409_CONFLICT, "Handle is already taken")
    if body.name is not None:
        profile.name = body.name
    if body.handle is not None and body.handle != profile.handle:
        if db.scalar(select(User.id).where(User.handle == body.handle)) is not None:
            raise taken
        profile.handle = body.handle
    try:
        db.commit()
    except IntegrityError as exc:
        # A concurrent request claimed the handle between the check and the commit.
        db.rollback()
        raise taken from exc
    return _me(user, profile)
