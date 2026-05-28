import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import SystemSettings, TrashItem, User
from app.schemas import TrashItemOut
from app.services.audit import log_action
from app.services.trash import purge_trash_item, restore_trash_item, soft_delete_path

router = APIRouter(prefix="/api/trash", tags=["trash"])


async def get_settings(db: AsyncSession) -> SystemSettings:
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one_or_none()
    if not settings or not settings.is_configured:
        raise HTTPException(status_code=503, detail="Depolama yapılandırılmamış")
    return settings


def _out(item: TrashItem) -> TrashItemOut:
    return TrashItemOut(
        id=str(item.id),
        original_path=item.original_path,
        trash_path=item.trash_path,
        name=item.name,
        is_dir=item.is_dir,
        size=item.size,
        deleted_at=item.deleted_at.isoformat() if item.deleted_at else "",
        expires_at=item.expires_at.isoformat() if item.expires_at else "",
    )


@router.get("", response_model=list[TrashItemOut])
async def list_trash(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TrashItem)
        .where(TrashItem.user_id == user.id)
        .order_by(TrashItem.deleted_at.desc())
    )
    return [_out(i) for i in result.scalars().all()]


@router.post("/restore/{item_id}")
async def restore_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    try:
        iid = uuid.UUID(item_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz ID") from exc

    result = await db.execute(select(TrashItem).where(TrashItem.id == iid))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Öğe bulunamadı")
    if item.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu öğeyi geri yükleyemezsiniz")

    try:
        path = await restore_trash_item(db, settings, item)
        await log_action(db, user, "restore", path)
        await db.commit()
    except OSError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "path": path}


@router.delete("/{item_id}")
async def delete_permanently(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    try:
        iid = uuid.UUID(item_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz ID") from exc

    result = await db.execute(select(TrashItem).where(TrashItem.id == iid))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Öğe bulunamadı")
    if item.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu öğeyi silemezsiniz")

    try:
        await purge_trash_item(db, settings, item)
        await log_action(db, user, "purge", item.original_path)
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


# Re-export for files router
__all__ = ["router", "soft_delete_path"]
