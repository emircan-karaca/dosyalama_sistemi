from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bootstrap import get_setup_step
from app.database import get_db
from app.deps import clear_session_cookie, get_current_user, set_session_cookie
from app.models import Session as DbSession
from app.models import SystemSettings, User
from app.schemas import LoginIn, MeOut, PasswordChangeIn, UserOut
from app.services.auth import (
    generate_session_token,
    hash_password,
    hash_token,
    session_expires_at,
    verify_password,
)
from app.services.user_storage import provision_user_storage

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
async def login(body: LoginIn, response: Response, db: AsyncSession = Depends(get_db)):
    if get_setup_step() != "ready":
        raise HTTPException(status_code=503, detail="Kurulum tamamlanmamış")
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email veya şifre hatalı")
    token = generate_session_token()
    session = DbSession(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=session_expires_at(),
    )
    db.add(session)
    await db.commit()
    set_session_cookie(response, token)
    return {"ok": True}


@router.post("/logout")
async def logout(
    response: Response,
    request_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        DbSession.__table__.delete().where(DbSession.user_id == request_user.id)
    )
    await db.commit()
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=MeOut)
async def me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sys_result = await db.execute(select(SystemSettings))
    sys_settings = sys_result.scalar_one_or_none()
    if sys_settings and sys_settings.is_configured:
        row = await provision_user_storage(db, sys_settings, user)
        await db.commit()
        return MeOut(
            id=str(user.id),
            email=user.email,
            role=user.role,
            home_path=row.home_path,
            is_storage_active=row.is_active,
        )
    return MeOut(
        id=str(user.id),
        email=user.email,
        role=user.role,
        home_path=f"/users/{user.id}",
        is_storage_active=True,
    )


@router.patch("/password")
async def change_password(
    body: PasswordChangeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Mevcut şifre hatalı")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True, "message": "Şifre güncellendi"}


@router.get("/users-list", response_model=list[UserOut])
async def list_users_for_share(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id != user.id).order_by(User.email))
    users = result.scalars().all()
    return [UserOut(id=str(u.id), email=u.email, role=u.role) for u in users]
