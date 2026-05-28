from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bootstrap import (
    DatabaseConfig,
    get_setup_step,
    load_bootstrap_state,
    load_db_config,
    mark_admin_created,
    mark_smb_configured,
    save_bootstrap_state,
    save_db_config,
)
from app.database import get_db, init_engine_from_config, reset_engine
from app.models import SystemSettings, User
from app.schemas import AdminCreateIn, DbConfigIn, SmbConfigIn
from app.services.auth import hash_password
from app.services.crypto import encrypt_value
from app.services.migrations import setup_database
from app.services.smb import test_connection
from app.services.user_storage import ensure_user_storage_record, provision_user_storage

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.get("/status")
async def setup_status():
    step = get_setup_step()
    return {"step": step, "ready": step == "ready"}


@router.post("/test-db")
async def test_db(body: DbConfigIn):
    if get_setup_step() not in ("needs_db",):
        raise HTTPException(status_code=400, detail="Veritabanı adımı zaten tamamlandı")
    cfg = DatabaseConfig(
        host=body.host,
        port=body.port,
        database=body.database,
        username=body.username,
        password=body.password,
    )
    try:
        from app.services.migrations import test_db_connection

        await test_db_connection(cfg)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Bağlantı kurulamadı: {exc}") from exc
    return {
        "ok": True,
        "message": f"PostgreSQL sunucusuna ({body.host}:{body.port}) başarıyla bağlanıldı.",
    }


@router.post("/save-db")
async def save_db(body: DbConfigIn):
    if get_setup_step() not in ("needs_db",):
        raise HTTPException(status_code=400, detail="Veritabanı adımı zaten tamamlandı")
    cfg = DatabaseConfig(
        host=body.host,
        port=body.port,
        database=body.database,
        username=body.username,
        password=body.password,
    )
    try:
        await setup_database(cfg)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Migration başarısız: {exc}") from exc
    save_db_config(cfg)
    state = load_bootstrap_state()
    state.db_configured = True
    save_bootstrap_state(state)
    reset_engine()
    init_engine_from_config()
    return {"ok": True}


@router.post("/test-smb")
async def test_smb(body: SmbConfigIn):
    if get_setup_step() != "needs_smb":
        raise HTTPException(status_code=400, detail="Önce veritabanını yapılandırın")
    try:
        test_connection(
            body.smb_host,
            body.smb_share,
            body.smb_username,
            body.smb_password,
            body.smb_root_path,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Paylaşıma erişilemedi: {exc}") from exc
    return {
        "ok": True,
        "message": f"SMB paylaşımına (\\\\{body.smb_host}\\{body.smb_share}) başarıyla erişildi.",
    }


@router.post("/save-smb")
async def save_smb(body: SmbConfigIn, db: AsyncSession = Depends(get_db)):
    if get_setup_step() != "needs_smb":
        raise HTTPException(status_code=400, detail="Önce veritabanını yapılandırın")
    try:
        test_connection(
            body.smb_host,
            body.smb_share,
            body.smb_username,
            body.smb_password,
            body.smb_root_path,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SMB bağlantısı başarısız: {exc}") from exc

    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = SystemSettings()
        db.add(settings)
    settings.disk_display_name = body.disk_display_name
    settings.smb_host = body.smb_host
    settings.smb_share = body.smb_share
    settings.smb_username = body.smb_username
    settings.smb_password_encrypted = encrypt_value(body.smb_password) if body.smb_password else ""
    settings.smb_root_path = body.smb_root_path or "/"
    await db.commit()
    mark_smb_configured()
    return {"ok": True}


@router.post("/create-admin")
async def create_admin(body: AdminCreateIn, db: AsyncSession = Depends(get_db)):
    if get_setup_step() != "needs_admin":
        raise HTTPException(status_code=400, detail="Önce SMB adımını tamamlayın")
    existing = await db.execute(select(User))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Admin zaten oluşturulmuş")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password), role="admin")
    db.add(user)
    await db.flush()
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one()
    await ensure_user_storage_record(db, user)
    if settings.is_configured or settings.smb_host:
        try:
            await provision_user_storage(db, settings, user)
        except Exception:
            pass
    settings.is_configured = True
    settings.configured_at = datetime.now(timezone.utc)
    await db.commit()
    mark_admin_created()
    return {"ok": True}
