import re
import secrets
import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.db import get_db
from app.models.user import User

_HANDLE_ATTEMPTS = 5


def _handle_base(user: CurrentUser) -> str:
    local_part = (user.email or "").split("@", 1)[0]
    return re.sub(r"[^a-z0-9_]", "", local_part.lower()) or "user"


def _sync_profile(db: Session, row: User, user: CurrentUser) -> None:
    """Follow changes to the Google profile. The handle is the user's stable id, so it stays."""
    changes = {
        field: value
        for field in ("name", "avatar_url")
        if (value := getattr(user, field)) and value != getattr(row, field)
    }
    if changes:
        for field, value in changes.items():
            setattr(row, field, value)
        db.commit()


def get_registered_user(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Return the signed-in user's row, creating it on their first request.

    There is no signup step: the name and avatar come from the Google identity carried
    by the access token and are kept in sync with it. Use this instead of
    get_current_user wherever rows reference the user table.
    """
    try:
        user_id = uuid.UUID(user.id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing credentials") from exc
    base = _handle_base(user)
    for _ in range(_HANDLE_ATTEMPTS):
        if (row := db.get(User, user_id)) is not None:
            _sync_profile(db, row, user)
            return row
        taken = db.scalar(select(User.id).where(User.handle == base)) is not None
        row = User(
            id=user_id,
            name=user.name or base,
            handle=base + secrets.token_hex(2) if taken else base,
            avatar_url=user.avatar_url,
        )
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request created this user or claimed the handle; look again.
            db.rollback()
        else:
            return row
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not create the user profile")
