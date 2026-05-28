from datetime import datetime, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bootstrap import get_setup_step
from app.database import get_db
from app.models import Session as DbSession
from app.models import User
from app.services.auth import SESSION_COOKIE, hash_token

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    if get_setup_step() != "ready":
        raise HTTPException(status_code=503, detail="Kurulum tamamlanmamış")
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Oturum gerekli")
    token_hash = hash_token(token)
    result = await db.execute(
        select(DbSession, User)
        .join(User, DbSession.user_id == User.id)
        .where(DbSession.token_hash == token_hash)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=401, detail="Geçersiz oturum")
    session, user = row
    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Oturum süresi doldu")
    return user


async def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    return user


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE, path="/")
