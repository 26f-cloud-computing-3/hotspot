from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/api")


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return user
