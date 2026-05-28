import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FileShare, SystemSettings, TrashItem, User, UserStorage
from app.services import storage
from app.services.user_storage import ensure_user_storage_record

TRASH_FOLDER = ".trash"
TRASH_RETENTION_DAYS = 30


def trash_dir(home_path: str) -> str:
    return f"{home_path.rstrip('/')}/{TRASH_FOLDER}"


async def resolve_path_owner(db: AsyncSession, path: str) -> UserStorage | None:
    norm = storage.normalize_path(path)
    result = await db.execute(select(UserStorage))
    for row in result.scalars().all():
        if norm == row.home_path or norm.startswith(row.home_path.rstrip("/") + "/"):
            return row
    return None


async def ensure_trash_folder(settings: SystemSettings, home_path: str) -> None:
    td = trash_dir(home_path)
    if not storage.path_exists(settings, td):
        storage.mkdir(settings, td)


async def remove_shares_for_path(db: AsyncSession, path: str) -> None:
    norm = storage.normalize_path(path)
    result = await db.execute(select(FileShare))
    for share in result.scalars().all():
        if share.path == norm or storage.normalize_path(share.path).startswith(norm.rstrip("/") + "/"):
            await db.delete(share)


async def soft_delete_path(
    db: AsyncSession,
    settings: SystemSettings,
    user: User,
    path: str,
    *,
    is_dir: bool | None = None,
) -> TrashItem:
    norm = storage.normalize_path(path)
    if norm.endswith(f"/{TRASH_FOLDER}") or f"/{TRASH_FOLDER}/" in norm:
        raise OSError("Çöp kutusu öğesi bu yolla silinemez.")

    owner_row = await resolve_path_owner(db, norm)
    if not owner_row:
        raise OSError("Dosya sahibi bulunamadı.")

    name = norm.strip("/").split("/")[-1] or "item"
    item_id = uuid.uuid4()
    trash_path = f"{trash_dir(owner_row.home_path)}/{item_id}_{name}"

    await ensure_trash_folder(settings, owner_row.home_path)
    storage.rename_path(settings, norm, trash_path)

    size = storage.path_size(settings, trash_path)
    now = datetime.now(timezone.utc)
    dir_flag = is_dir if is_dir is not None else storage.path_is_dir(settings, trash_path)
    item = TrashItem(
        id=item_id,
        user_id=owner_row.user_id,
        original_path=norm,
        trash_path=trash_path,
        name=name,
        is_dir=dir_flag,
        size=size,
        deleted_at=now,
        expires_at=now + timedelta(days=TRASH_RETENTION_DAYS),
    )
    db.add(item)
    await remove_shares_for_path(db, norm)
    await db.flush()
    return item


async def restore_trash_item(
    db: AsyncSession,
    settings: SystemSettings,
    item: TrashItem,
) -> str:
    if storage.path_exists(settings, item.original_path):
        raise OSError("Orijinal konumda aynı isimde bir dosya var.")

    storage.rename_path(settings, item.trash_path, item.original_path)
    original = item.original_path
    await db.delete(item)
    await db.flush()
    return original


async def purge_trash_item(db: AsyncSession, settings: SystemSettings, item: TrashItem) -> None:
    if storage.path_exists(settings, item.trash_path):
        storage.delete_path(settings, item.trash_path)
    await db.delete(item)


async def purge_expired_trash(db: AsyncSession, settings: SystemSettings) -> int:
    now = datetime.now(timezone.utc)
    result = await db.execute(select(TrashItem).where(TrashItem.expires_at <= now))
    items = result.scalars().all()
    count = 0
    for item in items:
        try:
            await purge_trash_item(db, settings, item)
            count += 1
        except Exception:
            pass
    if count:
        await db.commit()
    return count
