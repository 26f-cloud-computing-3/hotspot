import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import ColumnElement, Select, exists, select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.users import get_registered_user
from app.models.follow import Follow
from app.models.user import User

router = APIRouter(prefix="/api", tags=["follows"])

SEARCH_LIMIT = 20


class UserOut(BaseModel):
    id: uuid.UUID
    name: str
    handle: str
    avatar_url: str | None
    # Whether the signed-in user follows this user.
    is_following: bool


def _followed_by(user: User) -> ColumnElement[bool]:
    return exists().where(Follow.follower_id == user.id, Follow.followee_id == User.id)


def _users(db: Session, stmt: Select[tuple[User, bool]]) -> list[UserOut]:
    return [
        UserOut(
            id=row.id,
            name=row.name,
            handle=row.handle,
            avatar_url=row.avatar_url,
            is_following=is_following,
        )
        for row, is_following in db.execute(stmt)
    ]


def _like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/users")
def search_users(
    q: Annotated[str, Query(max_length=50)],
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    """Find other users by handle (prefix) or name (substring), case-insensitively."""
    term = _like_escape(q.strip().removeprefix("@"))
    if not term:
        return []
    return _users(
        db,
        select(User, _followed_by(user))
        .where(
            User.id != user.id,
            User.handle.ilike(f"{term}%", escape="\\") | User.name.ilike(f"%{term}%", escape="\\"),
        )
        .order_by(User.handle)
        .limit(SEARCH_LIMIT),
    )


@router.get("/follows/following")
def list_following(
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    """Users the signed-in user follows, most recently followed first."""
    return _users(
        db,
        select(User, true())
        .join(Follow, Follow.followee_id == User.id)
        .where(Follow.follower_id == user.id)
        .order_by(Follow.created_at.desc(), User.id),
    )


@router.get("/follows/followers")
def list_followers(
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    """Users who follow the signed-in user, newest follower first.

    There is deliberately no way to ask for another user's followers.
    """
    return _users(
        db,
        select(User, _followed_by(user))
        .where(
            User.id.in_(select(Follow.follower_id).where(Follow.followee_id == user.id)),
        )
        .order_by(
            select(Follow.created_at)
            .where(Follow.follower_id == User.id, Follow.followee_id == user.id)
            .scalar_subquery()
            .desc(),
            User.id,
        ),
    )


@router.put("/follows/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def follow(
    user_id: uuid.UUID,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> Response:
    """Follow a user. Following someone already followed is a no-op."""
    if user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot follow yourself")
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if db.get(Follow, (user.id, user_id)) is None:
        db.add(Follow(follower_id=user.id, followee_id=user_id))
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request already created the follow (or the user was just deleted).
            db.rollback()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/follows/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def unfollow(
    user_id: uuid.UUID,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> Response:
    """Stop following a user. Unfollowing someone not followed is a no-op."""
    row = db.get(Follow, (user.id, user_id))
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
