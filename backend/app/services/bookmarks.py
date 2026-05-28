import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserBookmark
from app.services import storage

MAX_RECENT = 20


async def upsert_recent(db: AsyncSession, user_id: uuid.UUID, path: str, label: str = "") -> None:
    norm = storage.normalize_path(path)
    result = await db.execute(
        select(UserBookmark).where(
            UserBookmark.user_id == user_id,
            UserBookmark.path == norm,
            UserBookmark.kind == "recent",
        )
    )
    row = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if row:
        row.updated_at = now
        if label:
            row.label = label
    else:
        db.add(
            UserBookmark(
                id=uuid.uuid4(),
                user_id=user_id,
                path=norm,
                label=label or norm.strip("/").split("/")[-1],
                kind="recent",
                updated_at=now,
            )
        )
    await db.flush()

    result = await db.execute(
        select(UserBookmark)
        .where(UserBookmark.user_id == user_id, UserBookmark.kind == "recent")
        .order_by(UserBookmark.updated_at.desc())
    )
    extras = result.scalars().all()[MAX_RECENT:]
    for old in extras:
        await db.delete(old)


async def toggle_favorite(db: AsyncSession, user_id: uuid.UUID, path: str, label: str = "") -> bool:
    norm = storage.normalize_path(path)
    result = await db.execute(
        select(UserBookmark).where(
            UserBookmark.user_id == user_id,
            UserBookmark.path == norm,
            UserBookmark.kind == "favorite",
        )
    )
    row = result.scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.flush()
        return False
    db.add(
        UserBookmark(
            id=uuid.uuid4(),
            user_id=user_id,
            path=norm,
            label=label or norm.strip("/").split("/")[-1],
            kind="favorite",
        )
    )
    await db.flush()
    return True
