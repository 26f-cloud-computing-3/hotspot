import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, StringConstraints
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.users import get_registered_user
from app.models.search_history import SearchHistory
from app.models.user import User

router = APIRouter(prefix="/api/search-histories", tags=["search-histories"])

# How many recent queries a user sees; older ones are hidden as new ones come in.
HISTORY_LIMIT = 10
# How far back popular searches count, and so how long a hidden query is kept.
POPULAR_WINDOW = timedelta(days=1)

# Same bounds as the `query` parameter of GET /api/map/search.
SearchQuery = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class SearchHistoryCreate(BaseModel):
    query: SearchQuery


class SearchHistoryOut(BaseModel):
    id: uuid.UUID
    query: str
    searched_at: datetime


def _recent(db: Session, user: User) -> list[SearchHistory]:
    return list(
        db.scalars(
            select(SearchHistory)
            .where(SearchHistory.user_id == user.id, SearchHistory.deleted_at.is_(None))
            .order_by(SearchHistory.searched_at.desc(), SearchHistory.id)
        )
    )


def _out(rows: list[SearchHistory]) -> list[SearchHistoryOut]:
    return [
        SearchHistoryOut(id=row.id, query=row.query, searched_at=row.searched_at)
        for row in rows[:HISTORY_LIMIT]
    ]


def _bring_back(row: SearchHistory, now: datetime) -> None:
    """Move an existing row to the top of the list, showing it again if it was hidden."""
    row.searched_at = now
    row.deleted_at = None


@router.get("")
def list_search_histories(
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> list[SearchHistoryOut]:
    """The signed-in user's recent search queries, most recently searched first."""
    return _out(_recent(db, user))


@router.post("")
def record_search_history(
    body: SearchHistoryCreate,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> list[SearchHistoryOut]:
    """Record a search query and return the updated list.

    A query already in the list moves to the top instead of being added again, and a hidden
    one comes back. Beyond HISTORY_LIMIT, the least recently searched queries are hidden:
    they stay out of the list but still count toward popular searches.
    """
    now = datetime.now(UTC)
    owned = (SearchHistory.user_id == user.id, SearchHistory.query == body.query)
    row = db.scalar(select(SearchHistory).where(*owned))
    if row is None:
        db.add(SearchHistory(user_id=user.id, query=body.query, searched_at=now))
    else:
        _bring_back(row, now)
    try:
        db.flush()
    except IntegrityError:
        # A concurrent request recorded the same query first; move that row to the top.
        db.rollback()
        row = db.scalar(select(SearchHistory).where(*owned))
        if row is not None:
            _bring_back(row, now)

    rows = _recent(db, user)
    stale = [row.id for row in rows[HISTORY_LIMIT:]]
    if stale:
        db.execute(update(SearchHistory).where(SearchHistory.id.in_(stale)).values(deleted_at=now))
    # Hidden rows stop counting once they are older than the popular-search window. This is
    # cleanup across all users: it returns nothing and only drops rows no one is shown, so
    # none of the rows loaded here are touched and the session need not be synced.
    db.execute(
        delete(SearchHistory)
        .where(
            SearchHistory.deleted_at.is_not(None),
            SearchHistory.searched_at < now - POPULAR_WINDOW,
        )
        .execution_options(synchronize_session=False)
    )
    db.commit()
    return _out(rows)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_search_histories(
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete all of the signed-in user's search queries, hidden ones included."""
    db.execute(delete(SearchHistory).where(SearchHistory.user_id == user.id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{history_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_search_history(
    history_id: uuid.UUID,
    user: User = Depends(get_registered_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete one search query. Another user's id, or a hidden one, is reported as not found."""
    row = db.scalar(
        select(SearchHistory).where(
            SearchHistory.id == history_id,
            SearchHistory.user_id == user.id,
            SearchHistory.deleted_at.is_(None),
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Search history not found")
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
