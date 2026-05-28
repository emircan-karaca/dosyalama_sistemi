from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import FileShare, SystemSettings, User
from app.schemas import ShareCreateIn, ShareOut
from app.services.audit import log_action
from app.services.notifications import notify
from app.services.permissions import require_owner_or_admin
from app.services import storage

router = APIRouter(prefix="/api/shares", tags=["shares"])


async def get_settings(db: AsyncSession) -> SystemSettings:
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one_or_none()
    if not settings or not settings.is_configured:
        raise HTTPException(status_code=503, detail="Depolama yapılandırılmamış")
    return settings


def _share_out(share: FileShare, owner_email: str, shared_email: str) -> ShareOut:
    return ShareOut(
        id=str(share.id),
        path=share.path,
        permission=share.permission,
        owner_id=str(share.owner_id),
        owner_email=owner_email,
        shared_with_user_id=str(share.shared_with_user_id),
        shared_with_email=shared_email,
        created_at=share.created_at.isoformat() if share.created_at else "",
    )


@router.get("/with-me", response_model=list[ShareOut])
async def shares_with_me(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FileShare, User.email)
        .join(User, FileShare.owner_id == User.id)
        .where(FileShare.shared_with_user_id == user.id)
        .order_by(FileShare.created_at.desc())
    )
    rows = result.all()
    out: list[ShareOut] = []
    for share, owner_email in rows:
        shared_result = await db.execute(select(User.email).where(User.id == share.shared_with_user_id))
        shared_email = shared_result.scalar_one()
        out.append(_share_out(share, owner_email, shared_email))
    return out


@router.get("/mine", response_model=list[ShareOut])
async def my_shares(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FileShare, User.email)
        .join(User, FileShare.shared_with_user_id == User.id)
        .where(FileShare.owner_id == user.id)
        .order_by(FileShare.created_at.desc())
    )
    rows = result.all()
    out: list[ShareOut] = []
    for share, shared_email in rows:
        owner_result = await db.execute(select(User.email).where(User.id == share.owner_id))
        owner_email = owner_result.scalar_one()
        out.append(_share_out(share, owner_email, shared_email))
    return out


@router.post("", response_model=ShareOut)
async def create_share(
    body: ShareCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    norm = storage.normalize_path(body.path)
    await require_owner_or_admin(db, user, norm)

    import uuid

    try:
        target_uid = uuid.UUID(body.shared_with_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz kullanıcı ID") from exc

    target = await db.execute(select(User).where(User.id == target_uid))
    target_user = target.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if target_user.id == user.id:
        raise HTTPException(status_code=400, detail="Kendinizle paylaşamazsınız")

    existing = await db.execute(
        select(FileShare).where(
            FileShare.owner_id == user.id,
            FileShare.path == norm,
            FileShare.shared_with_user_id == target_uid,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu paylaşım zaten mevcut")

    permission = body.permission if body.permission in ("read", "write") else "read"
    share = FileShare(
        owner_id=user.id,
        path=norm,
        shared_with_user_id=target_uid,
        permission=permission,
    )
    db.add(share)
    await log_action(db, user, "share", norm, detail=f"with {target_user.email} ({permission})")
    await notify(
        db,
        target_user.id,
        "share",
        "Yeni paylaşım",
        f"{user.email} sizinle '{norm}' paylaştı ({permission})",
        {"path": norm, "owner_email": user.email},
    )
    await db.commit()
    await db.refresh(share)
    return _share_out(share, user.email, target_user.email)


@router.delete("/{share_id}")
async def revoke_share(
    share_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    import uuid

    try:
        sid = uuid.UUID(share_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz paylaşım ID") from exc

    result = await db.execute(select(FileShare).where(FileShare.id == sid))
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Paylaşım bulunamadı")
    if share.owner_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu paylaşımı iptal edemezsiniz")

    await db.delete(share)
    await log_action(db, user, "unshare", share.path)
    await db.commit()
    return {"ok": True}
