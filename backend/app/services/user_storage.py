import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SystemSettings, User, UserStorage
from app.services import storage


def default_home_path(user_id: uuid.UUID) -> str:
    return f"/users/{user_id}"


async def get_user_storage(db: AsyncSession, user_id: uuid.UUID) -> UserStorage | None:
    result = await db.execute(select(UserStorage).where(UserStorage.user_id == user_id))
    return result.scalar_one_or_none()


async def ensure_user_storage_record(db: AsyncSession, user: User) -> UserStorage:
    row = await get_user_storage(db, user.id)
    if row:
        return row
    row = UserStorage(user_id=user.id, home_path=default_home_path(user.id))
    db.add(row)
    await db.flush()
    return row


async def provision_user_storage(
    db: AsyncSession,
    sys_settings: SystemSettings,
    user: User,
) -> UserStorage:
    row = await ensure_user_storage_record(db, user)
    if not row.is_provisioned:
        try:
            storage.mkdir(sys_settings, row.home_path)
        except OSError as exc:
            if "already exists" not in str(exc).lower() and "COLLISION" not in str(exc):
                raise
        row.is_provisioned = True
        await db.flush()
    return row


async def provision_all_users(db: AsyncSession, sys_settings: SystemSettings) -> int:
    result = await db.execute(select(User))
    users = result.scalars().all()
    count = 0
    for user in users:
        row = await provision_user_storage(db, sys_settings, user)
        if row.is_provisioned:
            count += 1
    await db.commit()
    return count
