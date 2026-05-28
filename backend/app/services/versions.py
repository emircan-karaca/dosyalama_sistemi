import hashlib
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FileVersion, SystemSettings, User
from app.services import storage
from app.services.trash import resolve_path_owner
from app.services.user_storage import ensure_user_storage_record

MAX_VERSIONS = 10
VERSIONS_FOLDER = ".versions"


def versions_root(home_path: str) -> str:
    return f"{home_path.rstrip('/')}/{VERSIONS_FOLDER}"


def _path_hash(logical_path: str) -> str:
    return hashlib.sha256(logical_path.encode()).hexdigest()[:16]


async def snapshot_before_overwrite(
    db: AsyncSession,
    settings: SystemSettings,
    user: User,
    logical_path: str,
) -> FileVersion | None:
    norm = storage.normalize_path(logical_path)
    if not storage.path_exists(settings, norm):
        return None

    row = await ensure_user_storage_record(db, user)
    owner_row = await resolve_path_owner(db, norm)
    owner_home = owner_row.home_path if owner_row else row.home_path

    root = versions_root(owner_home)
    if not storage.path_exists(settings, root):
        storage.mkdir(settings, root)

    vdir = f"{root}/{_path_hash(norm)}"
    if not storage.path_exists(settings, vdir):
        storage.mkdir(settings, vdir)

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    filename = norm.strip("/").split("/")[-1]
    version_path = f"{vdir}/{ts}_{filename}"
    storage.copy_path(settings, norm, version_path)
    size = storage.path_size(settings, version_path)

    version = FileVersion(
        id=uuid.uuid4(),
        logical_path=norm,
        version_path=version_path,
        size=size,
        created_by=user.id,
    )
    db.add(version)
    await db.flush()
    await _trim_versions(db, settings, norm)
    return version


async def _trim_versions(db: AsyncSession, settings: SystemSettings, logical_path: str) -> None:
    result = await db.execute(
        select(FileVersion)
        .where(FileVersion.logical_path == logical_path)
        .order_by(FileVersion.created_at.desc())
    )
    versions = result.scalars().all()
    for old in versions[MAX_VERSIONS:]:
        if storage.path_exists(settings, old.version_path):
            try:
                storage.delete_path(settings, old.version_path)
            except OSError:
                pass
        await db.delete(old)


async def restore_version(
    db: AsyncSession,
    settings: SystemSettings,
    user: User,
    version: FileVersion,
) -> None:
    if storage.path_exists(settings, version.logical_path):
        await snapshot_before_overwrite(db, settings, user, version.logical_path)
    storage.copy_path(settings, version.version_path, version.logical_path)
