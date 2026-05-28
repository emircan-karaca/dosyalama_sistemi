import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Notification, User
from app.schemas import NotificationOut
from app.services.notifications import mark_read, unread_count

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _out(n: Notification) -> NotificationOut:
    return NotificationOut(
        id=str(n.id),
        type=n.type,
        title=n.title,
        body=n.body,
        meta_json=n.meta_json,
        read=n.read,
        created_at=n.created_at.isoformat() if n.created_at else "",
    )


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    )
    return [_out(n) for n in result.scalars().all()]


@router.get("/unread-count")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count = await unread_count(db, user.id)
    return {"count": count}


@router.post("/{notification_id}/read")
async def read_notification(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        nid = uuid.UUID(notification_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz ID") from exc
    await mark_read(db, user.id, nid)
    await db.commit()
    return {"ok": True}


@router.post("/read-all")
async def read_all(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Notification).where(Notification.user_id == user.id, Notification.read.is_(False)))
    for n in result.scalars().all():
        n.read = True
    await db.commit()
    return {"ok": True}
