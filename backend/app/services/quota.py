from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SystemSettings, User
from app.services import storage
from app.services.user_storage import ensure_user_storage_record


async def get_usage_bytes(settings: SystemSettings, home_path: str) -> int:
    return storage.path_size(settings, home_path)


async def check_quota_for_upload(
    db: AsyncSession,
    settings: SystemSettings,
    user: User,
    additional_bytes: int,
) -> None:
    row = await ensure_user_storage_record(db, user)
    if not row.quota_bytes:
        return
    used = await get_usage_bytes(settings, row.home_path)
    if used + additional_bytes > row.quota_bytes:
        used_mb = used / (1024 * 1024)
        quota_mb = row.quota_bytes / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Depolama kotası aşıldı ({used_mb:.1f} / {quota_mb:.1f} MB)",
        )
