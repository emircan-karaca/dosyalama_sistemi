from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import AuditLog, User
from app.schemas import AuditLogOut

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("/me", response_model=list[AuditLogOut])
async def my_activity(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.user_id == user.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    return [
        AuditLogOut(
            id=str(l.id),
            user_email=l.user_email,
            action=l.action,
            path=l.path,
            detail=l.detail,
            created_at=l.created_at.isoformat() if l.created_at else "",
        )
        for l in result.scalars().all()
    ]
