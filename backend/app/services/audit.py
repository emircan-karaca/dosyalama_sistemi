import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, User


async def log_action(
    db: AsyncSession,
    user: User | None,
    action: str,
    path: str = "",
    detail: str = "",
) -> None:
    entry = AuditLog(
        id=uuid.uuid4(),
        user_id=user.id if user else None,
        user_email=user.email if user else "",
        action=action,
        path=path,
        detail=detail,
    )
    db.add(entry)
    await db.flush()
