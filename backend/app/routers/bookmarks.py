from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import User, UserBookmark
from app.schemas import BookmarkOut, BookmarkToggleIn
from app.services.bookmarks import toggle_favorite, upsert_recent
from app.services.permissions import require_access

router = APIRouter(prefix="/api/bookmarks", tags=["bookmarks"])


def _out(b: UserBookmark) -> BookmarkOut:
    return BookmarkOut(
        id=str(b.id),
        path=b.path,
        label=b.label,
        kind=b.kind,
        updated_at=(b.updated_at or b.created_at).isoformat() if (b.updated_at or b.created_at) else "",
    )


@router.get("", response_model=list[BookmarkOut])
async def list_bookmarks(
    kind: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(UserBookmark).where(UserBookmark.user_id == user.id)
    if kind in ("favorite", "recent"):
        q = q.where(UserBookmark.kind == kind)
    if kind == "recent":
        q = q.order_by(UserBookmark.updated_at.desc())
    else:
        q = q.order_by(UserBookmark.label.asc())
    result = await db.execute(q.limit(20 if kind == "recent" else 100))
    return [_out(b) for b in result.scalars().all()]


@router.post("/recent")
async def track_recent(
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_access(db, user, path)
    label = path.strip("/").split("/")[-1]
    await upsert_recent(db, user.id, path, label)
    await db.commit()
    return {"ok": True}


@router.post("/favorite")
async def favorite_toggle(
    body: BookmarkToggleIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_access(db, user, body.path)
    added = await toggle_favorite(db, user.id, body.path, body.label)
    await db.commit()
    return {"ok": True, "favorited": added}
