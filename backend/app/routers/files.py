import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import AuditLog, FileComment, FileShare, FileVersion, SystemSettings, User
from app.schemas import (
    BulkDeleteIn,
    CopyMoveIn,
    FileCommentCreateIn,
    FileCommentOut,
    FileEntryOut,
    FileVersionOut,
    UsageOut,
)
from app.services import storage
from app.services.audit import log_action
from app.services.file_ops import copy_item, move_item, unique_dest
from app.services.permissions import require_access
from app.services.quota import check_quota_for_upload, get_usage_bytes
from app.services.storage import preview_mime
from app.services.trash import soft_delete_path
from app.services.user_storage import ensure_user_storage_record, provision_user_storage
from app.services.versions import restore_version, snapshot_before_overwrite

router = APIRouter(prefix="/api/files", tags=["files"])

PREVIEW_MAX = 1024 * 1024


async def get_settings(db: AsyncSession) -> SystemSettings:
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one_or_none()
    if not settings or not settings.is_configured:
        raise HTTPException(status_code=503, detail="Depolama yapılandırılmamış")
    return settings


def _entry_out(e) -> FileEntryOut:
    return FileEntryOut(
        name=e.name,
        path=e.path,
        is_dir=e.is_dir,
        size=e.size,
        modified=e.modified.isoformat() if e.modified else None,
    )


@router.get("/workspace")
async def workspace(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sys_settings = await get_settings(db)
    row = await provision_user_storage(db, sys_settings, user)
    await db.commit()
    return {
        "home_path": row.home_path,
        "is_storage_active": row.is_active,
        "is_provisioned": row.is_provisioned,
        "quota_bytes": row.quota_bytes,
    }


@router.get("/usage", response_model=UsageOut)
async def usage(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    row = await ensure_user_storage_record(db, user)
    used = await get_usage_bytes(settings, row.home_path)
    return UsageOut(used_bytes=used, quota_bytes=row.quota_bytes)


@router.get("", response_model=list[FileEntryOut])
async def list_files(
    path: str = Query("/"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    norm = storage.normalize_path(path)
    await require_access(db, user, norm)
    try:
        entries = storage.list_files(settings, norm)
    except OSError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return [_entry_out(e) for e in entries]


@router.get("/search", response_model=list[FileEntryOut])
async def search_files(
    q: str = Query(..., min_length=1),
    scope: str = Query("all"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    row = await ensure_user_storage_record(db, user)
    results: list = []
    seen: set[str] = set()

    roots: list[str] = []
    if scope in ("home", "all"):
        roots.append(row.home_path)
    if scope in ("shared", "all"):
        share_result = await db.execute(select(FileShare).where(FileShare.shared_with_user_id == user.id))
        for share in share_result.scalars().all():
            if share.path not in roots:
                roots.append(share.path)

    for root in roots:
        try:
            await require_access(db, user, root)
            for entry in storage.search_files(settings, root, q, max_results=100 - len(results)):
                if entry.path not in seen:
                    seen.add(entry.path)
                    results.append(entry)
                if len(results) >= 100:
                    break
        except HTTPException:
            continue
        if len(results) >= 100:
            break

    return [_entry_out(e) for e in results]


@router.get("/history", response_model=list[dict])
async def file_history(
    path: str = Query(...),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    norm = storage.normalize_path(path)
    await require_access(db, user, norm)
    prefix = norm.rstrip("/")
    result = await db.execute(
        select(AuditLog)
        .where(
            or_(
                AuditLog.path == norm,
                AuditLog.path.startswith(prefix + "/"),
                AuditLog.detail == norm,
                AuditLog.detail.startswith(prefix + "/"),
            )
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    return [
        {
            "id": str(l.id),
            "user_email": l.user_email,
            "action": l.action,
            "path": l.path,
            "detail": l.detail,
            "created_at": l.created_at.isoformat() if l.created_at else "",
        }
        for l in result.scalars().all()
    ]


@router.get("/versions", response_model=list[FileVersionOut])
async def list_versions(
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    norm = storage.normalize_path(path)
    await require_access(db, user, norm)
    result = await db.execute(
        select(FileVersion)
        .where(FileVersion.logical_path == norm)
        .order_by(FileVersion.created_at.desc())
        .limit(10)
    )
    return [
        FileVersionOut(
            id=str(v.id),
            logical_path=v.logical_path,
            version_path=v.version_path,
            size=v.size,
            created_by=str(v.created_by) if v.created_by else None,
            created_at=v.created_at.isoformat() if v.created_at else "",
        )
        for v in result.scalars().all()
    ]


@router.post("/versions/{version_id}/restore")
async def restore_file_version(
    version_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    try:
        vid = uuid.UUID(version_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz ID") from exc
    result = await db.execute(select(FileVersion).where(FileVersion.id == vid))
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Sürüm bulunamadı")
    await require_access(db, user, version.logical_path, write=True)
    try:
        await restore_version(db, settings, user, version)
        await log_action(db, user, "version_restore", version.logical_path, detail=str(version.id))
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/comments", response_model=list[FileCommentOut])
async def list_comments(
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    norm = storage.normalize_path(path)
    await require_access(db, user, norm)
    result = await db.execute(
        select(FileComment, User.email)
        .join(User, FileComment.user_id == User.id)
        .where(FileComment.path == norm)
        .order_by(FileComment.created_at.asc())
    )
    return [
        FileCommentOut(
            id=str(c.id),
            path=c.path,
            user_id=str(c.user_id),
            user_email=email,
            body=c.body,
            created_at=c.created_at.isoformat() if c.created_at else "",
        )
        for c, email in result.all()
    ]


@router.post("/comments", response_model=FileCommentOut)
async def add_comment(
    body: FileCommentCreateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    norm = storage.normalize_path(body.path)
    await require_access(db, user, norm)
    comment = FileComment(id=uuid.uuid4(), path=norm, user_id=user.id, body=body.body.strip())
    db.add(comment)
    await log_action(db, user, "comment", norm, detail=body.body[:200])
    await db.commit()
    await db.refresh(comment)
    return FileCommentOut(
        id=str(comment.id),
        path=comment.path,
        user_id=str(comment.user_id),
        user_email=user.email,
        body=comment.body,
        created_at=comment.created_at.isoformat() if comment.created_at else "",
    )


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        cid = uuid.UUID(comment_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz ID") from exc
    result = await db.execute(select(FileComment).where(FileComment.id == cid))
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Yorum bulunamadı")
    if comment.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu yorumu silemezsiniz")
    await db.delete(comment)
    await db.commit()
    return {"ok": True}


@router.post("/mkdir")
async def mkdir(
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    norm = storage.normalize_path(path)
    await require_access(db, user, norm, write=True)
    try:
        storage.mkdir(settings, norm)
        await log_action(db, user, "mkdir", norm)
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Klasör oluşturulamadı: {exc}") from exc
    return {"ok": True}


@router.patch("/rename")
async def rename(
    old_path: str = Query(...),
    new_path: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    old_norm = storage.normalize_path(old_path)
    new_norm = storage.normalize_path(new_path)
    await require_access(db, user, old_norm, write=True)
    await require_access(db, user, new_norm, write=True)
    try:
        storage.rename_path(settings, old_norm, new_norm)
        await log_action(db, user, "rename", old_norm, detail=new_norm)
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Yeniden adlandırılamadı: {exc}") from exc
    return {"ok": True}


@router.post("/copy")
async def copy_files(
    body: CopyMoveIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    dest_dir = storage.normalize_path(body.dest_dir)
    await require_access(db, user, dest_dir, write=True)
    on_conflict = body.on_conflict if body.on_conflict in ("rename", "overwrite", "skip") else "rename"
    copied: list[str] = []
    errors: list[str] = []

    for src in body.src_paths:
        src_norm = storage.normalize_path(src)
        try:
            await require_access(db, user, src_norm)
            name = src_norm.strip("/").split("/")[-1]
            dest = unique_dest(settings, dest_dir, name, on_conflict)
            if not dest:
                continue
            await check_quota_for_upload(db, settings, user, storage.path_size(settings, src_norm))
            copy_item(settings, src_norm, dest)
            await log_action(db, user, "copy", src_norm, detail=dest)
            copied.append(dest)
        except HTTPException as exc:
            errors.append(f"{src_norm}: {exc.detail}")
        except Exception as exc:
            errors.append(f"{src_norm}: {exc}")

    await db.commit()
    return {"ok": True, "copied": copied, "errors": errors}


@router.post("/move")
async def move_files(
    body: CopyMoveIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    dest_dir = storage.normalize_path(body.dest_dir)
    await require_access(db, user, dest_dir, write=True)
    on_conflict = body.on_conflict if body.on_conflict in ("rename", "overwrite", "skip") else "rename"
    moved: list[str] = []
    errors: list[str] = []

    for src in body.src_paths:
        src_norm = storage.normalize_path(src)
        try:
            await require_access(db, user, src_norm, write=True)
            name = src_norm.strip("/").split("/")[-1]
            dest = unique_dest(settings, dest_dir, name, on_conflict)
            if not dest:
                continue
            if on_conflict == "overwrite" and storage.path_exists(settings, dest):
                storage.delete_path(settings, dest)
            move_item(settings, src_norm, dest)
            await log_action(db, user, "move", src_norm, detail=dest)
            moved.append(dest)
        except HTTPException as exc:
            errors.append(f"{src_norm}: {exc.detail}")
        except Exception as exc:
            errors.append(f"{src_norm}: {exc}")

    await db.commit()
    return {"ok": True, "moved": moved, "errors": errors}


@router.delete("")
async def delete_file(
    path: str = Query(...),
    is_dir: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    norm = storage.normalize_path(path)
    await require_access(db, user, norm, write=True)
    try:
        await soft_delete_path(db, settings, user, norm, is_dir=is_dir)
        await log_action(db, user, "trash", norm)
        await db.commit()
    except OSError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.post("/bulk-delete")
async def bulk_delete(
    body: BulkDeleteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    errors: list[str] = []
    for p in body.paths:
        norm = storage.normalize_path(p)
        if norm == "/":
            continue
        try:
            await require_access(db, user, norm, write=True)
            await soft_delete_path(db, settings, user, norm)
            await log_action(db, user, "trash", norm, detail="bulk")
        except HTTPException as exc:
            errors.append(f"{norm}: {exc.detail}")
        except Exception as exc:
            errors.append(f"{norm}: {exc}")
    await db.commit()
    if errors and len(errors) == len(body.paths):
        raise HTTPException(status_code=400, detail="; ".join(errors))
    return {"ok": True, "errors": errors}


@router.post("/upload")
async def upload(
    path: str = Query(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    filename = file.filename or "upload.bin"
    parent = storage.normalize_path(path)
    await require_access(db, user, parent, write=True)
    full_path = storage.normalize_path(f"{parent.rstrip('/')}/{filename}")
    await require_access(db, user, full_path, write=True)
    try:
        import io

        content = await file.read()
        await check_quota_for_upload(db, settings, user, len(content))
        if storage.path_exists(settings, full_path) and not storage.path_is_dir(settings, full_path):
            await snapshot_before_overwrite(db, settings, user, full_path)
        storage.upload_file(settings, full_path, io.BytesIO(content))
        await log_action(db, user, "upload", full_path, detail=f"{len(content)} bytes")
        await db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Yüklenemedi: {exc}") from exc
    return {"ok": True, "path": full_path}


@router.get("/download")
async def download(
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    norm = storage.normalize_path(path)
    await require_access(db, user, norm)
    try:
        buf, filename = storage.download_file(settings, norm)
        await log_action(db, user, "download", norm)
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"İndirilemedi: {exc}") from exc
    return StreamingResponse(
        buf,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/download-zip")
async def download_zip(
    paths: str = Query(..., description="Comma-separated paths"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    path_list = [storage.normalize_path(p.strip()) for p in paths.split(",") if p.strip()]
    if not path_list:
        raise HTTPException(status_code=400, detail="En az bir yol gerekli")
    for p in path_list:
        await require_access(db, user, p)
    try:
        buf = storage.build_zip(settings, path_list)
        await log_action(db, user, "download_zip", ",".join(path_list))
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"ZIP oluşturulamadı: {exc}") from exc
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="download.zip"'},
    )


@router.get("/preview")
async def preview(
    path: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    settings = await get_settings(db)
    norm = storage.normalize_path(path)
    await require_access(db, user, norm)
    mime = preview_mime(norm)
    if not mime:
        raise HTTPException(status_code=400, detail="Bu dosya türü önizlenemez")
    try:
        buf, filename = storage.download_file(settings, norm)
        data = buf.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Önizlenemedi: {exc}") from exc
    if mime.startswith("text/") or mime == "application/json":
        if len(data) > PREVIEW_MAX:
            raise HTTPException(status_code=400, detail="Metin dosyası çok büyük (max 1MB)")
    return StreamingResponse(
        iter([data]),
        media_type=mime.split(";")[0],
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
