from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FileShare, User, UserStorage
from app.services import storage
from app.services.user_storage import ensure_user_storage_record

USERS_ROOT = "/users"


def path_under(parent: str, child: str) -> bool:
    parent_norm = storage.normalize_path(parent)
    child_norm = storage.normalize_path(child)
    if parent_norm == child_norm:
        return True
    return child_norm.startswith(parent_norm.rstrip("/") + "/")


def is_share_root(path: str) -> bool:
    norm = storage.normalize_path(path)
    return norm == "/"


async def require_access(
    db: AsyncSession,
    user: User,
    path: str,
    *,
    write: bool = False,
) -> UserStorage:
    norm = storage.normalize_path(path)

    if is_share_root(norm):
        raise HTTPException(status_code=403, detail="Kök dizine erişilemez. Depolamam klasörünü kullanın.")

    row = await ensure_user_storage_record(db, user)
    if not row.is_active:
        raise HTTPException(status_code=403, detail="Depolama alanınız devre dışı")

    if path_under(row.home_path, norm):
        return row

    if user.role == "admin" and path_under(USERS_ROOT, norm):
        return row

    result = await db.execute(select(FileShare).where(FileShare.shared_with_user_id == user.id))
    for share in result.scalars().all():
        if path_under(share.path, norm):
            if write and share.permission != "write":
                raise HTTPException(status_code=403, detail="Bu dosya için yazma izniniz yok")
            return row

    raise HTTPException(status_code=403, detail="Bu dosyaya erişim izniniz yok")


async def require_owner_or_admin(db: AsyncSession, user: User, path: str) -> None:
    norm = storage.normalize_path(path)
    row = await ensure_user_storage_record(db, user)
    if not path_under(row.home_path, norm):
        raise HTTPException(status_code=403, detail="Sadece kendi dosyalarınızı paylaşabilirsiniz")
