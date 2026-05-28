import json
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, User


async def notify(
    db: AsyncSession,
    user_id: uuid.UUID,
    type: str,
    title: str,
    body: str = "",
    meta: dict | None = None,
) -> Notification:
    entry = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        meta_json=json.dumps(meta or {}),
    )
    db.add(entry)
    await db.flush()
    return entry


async def unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id,
            Notification.read.is_(False),
        )
    )
    return int(result.scalar_one())


async def mark_read(db: AsyncSession, user_id: uuid.UUID, notification_id: uuid.UUID) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user_id)
        .values(read=True)
    )
