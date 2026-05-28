import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import ShareLink, SystemSettings, User
from app.schemas import ShareLinkCreateIn, ShareLinkOut
from app.services.audit import log_action
from app.services.auth import hash_password, verify_password
from app.services.permissions import require_owner_or_admin
from app.services import storage

router = APIRouter(prefix="/api/share-links", tags=["share-links"])
public_router = APIRouter(prefix="/api/public/share", tags=["public-share"])


async def get_settings(db: AsyncSession) -> SystemSettings:
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one_or_none()
    if not settings or not settings.is_configured:
        raise HTTPException(status_code=503, detail="Depolama yapılandırılmamış")
    return settings


def _link_out(link: ShareLink, base_url: str = "") -> ShareLinkOut:
    return ShareLinkOut(
        id=str(link.id),
        token=link.token,
        path=link.path,
        url=f"/share/{link.token}",
        expires_at=link.expires_at.isoformat() if link.expires_at else None,
        max_downloads=link.max_downloads,
        download_count=link.download_count,
        created_at=link.created_at.isoformat() if link.created_at else "",
    )


async def _get_valid_link(db: AsyncSession, token: str, password: str | None = None) -> ShareLink:
    result = await db.execute(select(ShareLink).where(ShareLink.token == token))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Paylaşım linki bulunamadı")
    if link.expires_at and link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Link süresi dolmuş")
    if link.max_downloads is not None and link.download_count >= link.max_downloads:
        raise HTTPException(status_code=410, detail="İndirme limiti doldu")
    if link.password_hash:
        if not password or not verify_password(password, link.password_hash):
            raise HTTPException(status_code=401, detail="Şifre gerekli")
    return link


@router.get("", response_model=list[ShareLinkOut])
async def my_links(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ShareLink).where(ShareLink.owner_id == user.id).order_by(ShareLink.created_at.desc())
    )
    return [_link_out(l) for l in result.scalars().all()]


@router.post("", response_model=ShareLinkOut)
async def create_link(
    body: ShareLinkCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    norm = storage.normalize_path(body.path)
    await require_owner_or_admin(db, user, norm)

    expires_at = None
    if body.expires_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_hours)

    link = ShareLink(
        id=uuid.uuid4(),
        token=secrets.token_urlsafe(24),
        owner_id=user.id,
        path=norm,
        password_hash=hash_password(body.password) if body.password else None,
        expires_at=expires_at,
        max_downloads=body.max_downloads,
    )
    db.add(link)
    await log_action(db, user, "share_link_create", norm, detail=link.token)
    await db.commit()
    await db.refresh(link)
    return _link_out(link)


@router.delete("/{link_id}")
async def revoke_link(
    link_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        lid = uuid.UUID(link_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz ID") from exc
    result = await db.execute(select(ShareLink).where(ShareLink.id == lid))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link bulunamadı")
    if link.owner_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Yetkisiz")
    await db.delete(link)
    await log_action(db, user, "share_link_revoke", link.path)
    await db.commit()
    return {"ok": True}


@public_router.get("/{token}")
async def public_info(
    token: str,
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    link = await _get_valid_link(db, token, password)
    settings = await get_settings(db)
    norm = link.path
    try:
        if storage.path_is_dir(settings, norm):
            entries = storage.list_files(settings, norm)
            return {
                "path": norm,
                "is_dir": True,
                "entries": [
                    {"name": e.name, "path": e.path, "is_dir": e.is_dir, "size": e.size}
                    for e in entries
                ],
            }
        size = storage.path_size(settings, norm)
        return {"path": norm, "is_dir": False, "name": norm.strip("/").split("/")[-1], "size": size}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@public_router.get("/{token}/download")
async def public_download(
    token: str,
    path: str | None = Query(None),
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    link = await _get_valid_link(db, token, password)
    settings = await get_settings(db)
    target = storage.normalize_path(path) if path else link.path
    link_prefix = link.path.rstrip("/")
    if target != link_prefix and not target.startswith(link_prefix + "/"):
        raise HTTPException(status_code=403, detail="Bu dosyaya erişim yok")

    try:
        buf, filename = storage.download_file(settings, target)
        link.download_count += 1
        await log_action(db, None, "share_link_access", target, detail=token)
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StreamingResponse(
        buf,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
