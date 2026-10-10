import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import CurrentUser, get_current_user
from app.core.users import get_registered_user
from app.models.user import User

router = APIRouter(prefix="/api")


class Me(BaseModel):
    id: uuid.UUID
    email: str | None
    name: str
    handle: str
    avatar_url: str | None


@router.get("/me")
def me(
    user: CurrentUser = Depends(get_current_user),
    profile: User = Depends(get_registered_user),
) -> Me:
    """The signed-in user's profile. Creates the user row on first call."""
    return Me(
        id=profile.id,
        email=user.email,
        name=profile.name,
        handle=profile.handle,
        avatar_url=profile.avatar_url,
    )
