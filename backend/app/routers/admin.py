import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bootstrap import DatabaseConfig, load_db_config, save_db_config
from app.config import settings as app_settings
from app.database import get_db, get_engine, init_engine_from_config, reset_engine
from app.deps import get_admin_user
from app.models import AuditLog, SystemSettings, User, UserStorage
from app.schemas import (
    AuditLogOut,
    DbConfigIn,
    DbConfigOut,
    SettingsOut,
    SettingsUpdateIn,
    UserAdminOut,
    UserCreateIn,
    UserStorageOut,
    UserStorageUpdateIn,
)
from app.services.user_storage import ensure_user_storage_record, provision_all_users, provision_user_storage
from app.services.auth import hash_password
from app.services.crypto import decrypt_value, encrypt_value
from app.services.migrations import setup_database, test_db_connection
from app.services import storage
from app.services.smb import test_connection

router = APIRouter(prefix="/api/admin", tags=["admin"])

_start_time = time.time()


@router.get("/settings", response_model=SettingsOut)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one()
    return SettingsOut(
        disk_display_name=settings.disk_display_name,
        smb_host=settings.smb_host,
        smb_share=settings.smb_share,
        smb_username=settings.smb_username,
        smb_root_path=settings.smb_root_path,
        storage_mode=settings.storage_mode or "smb",
        has_smb_password=bool(settings.smb_password_encrypted),
    )


@router.patch("/settings", response_model=SettingsOut)
async def update_settings(
    body: SettingsUpdateIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one()
    mode = body.storage_mode or settings.storage_mode or "smb"
    password = body.smb_password
    host = body.smb_host or settings.smb_host
    share = body.smb_share or settings.smb_share
    username = body.smb_username if body.smb_username is not None else settings.smb_username
    root = body.smb_root_path if body.smb_root_path is not None else settings.smb_root_path
    if password is None and settings.smb_password_encrypted:
        password = decrypt_value(settings.smb_password_encrypted)

    settings.storage_mode = mode
    if mode == "mount":
        try:
            storage.test_storage(settings)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Mount test başarısız: {exc}") from exc
    else:
        try:
            test_connection(host, share, username, password or "", root)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"SMB test başarısız: {exc}") from exc

    if body.disk_display_name is not None:
        settings.disk_display_name = body.disk_display_name
    settings.smb_host = host
    settings.smb_share = share
    settings.smb_username = username
    settings.smb_root_path = root
    if body.smb_password:
        settings.smb_password_encrypted = encrypt_value(body.smb_password)
    await db.commit()
    return SettingsOut(
        disk_display_name=settings.disk_display_name,
        smb_host=settings.smb_host,
        smb_share=settings.smb_share,
        smb_username=settings.smb_username,
        smb_root_path=settings.smb_root_path,
        storage_mode=settings.storage_mode,
        has_smb_password=bool(settings.smb_password_encrypted),
    )


@router.get("/database", response_model=DbConfigOut)
async def get_database(_: User = Depends(get_admin_user)):
    cfg = load_db_config()
    if not cfg:
        raise HTTPException(status_code=404, detail="Veritabanı yapılandırılmamış")
    return DbConfigOut(
        host=cfg.host,
        port=cfg.port,
        database=cfg.database,
        username=cfg.username,
    )


@router.post("/test-smb")
async def admin_test_smb(body: SettingsUpdateIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one()
    mode = body.storage_mode or settings.storage_mode or "smb"
    if mode == "mount":
        settings.storage_mode = "mount"
        try:
            storage.test_storage(settings)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Mount erişilemedi: {exc}") from exc
        return {"ok": True, "message": f"CIFS mount ({app_settings.mount_path}) erişilebilir."}

    host = body.smb_host or settings.smb_host
    share = body.smb_share or settings.smb_share
    username = body.smb_username if body.smb_username is not None else settings.smb_username
    root = body.smb_root_path if body.smb_root_path is not None else settings.smb_root_path
    password = body.smb_password
    if not password and settings.smb_password_encrypted:
        password = decrypt_value(settings.smb_password_encrypted)
    try:
        test_connection(host, share, username or "", password or "", root)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Paylaşıma erişilemedi: {exc}") from exc
    return {"ok": True, "message": f"SMB paylaşımına (\\\\{host}\\{share}) başarıyla erişildi."}


@router.post("/test-db")
async def admin_test_db(body: DbConfigIn, _: User = Depends(get_admin_user)):
    cfg = DatabaseConfig(
        host=body.host,
        port=body.port,
        database=body.database,
        username=body.username,
        password=body.password,
    )
    try:
        await test_db_connection(cfg)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Bağlantı başarısız: {exc}") from exc
    return {"ok": True}


@router.patch("/database")
async def update_database(body: DbConfigIn, _: User = Depends(get_admin_user)):
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
        raise HTTPException(status_code=400, detail=f"Güncelleme başarısız: {exc}") from exc
    save_db_config(cfg)
    reset_engine()
    init_engine_from_config()
    return {"ok": True}


@router.get("/disk-name")
async def disk_name(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one()
    return {"disk_display_name": settings.disk_display_name}


@router.post("/reset-smb")
async def reset_smb(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one()
    storage.reset_connections(settings)
    return {"ok": True, "message": "Depolama bağlantısı sıfırlandı."}


@router.get("/smb-diagnose")
async def smb_diagnose(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one()
    diag = storage.diagnose(settings)
    diag["storage_mode"] = storage.effective_mode(settings)
    diag["mount_path"] = app_settings.mount_path
    return diag


@router.post("/fix-smb-root")
async def fix_smb_root(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    result = await db.execute(select(SystemSettings))
    settings = result.scalar_one()
    if storage.effective_mode(settings) == "mount":
        settings.smb_root_path = "/"
        await db.commit()
        return {"ok": True, "message": "Kök klasör '/' olarak ayarlandı."}
    password = decrypt_value(settings.smb_password_encrypted) if settings.smb_password_encrypted else ""
    try:
        test_connection(settings.smb_host, settings.smb_share, settings.smb_username, password, "/")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Paylaşım kökü test edilemedi: {exc}") from exc
    settings.smb_root_path = "/"
    await db.commit()
    storage.reset_connections(settings)
    return {"ok": True, "message": "Kök klasör '/' olarak ayarlandı."}


@router.get("/users", response_model=list[UserAdminOut])
async def list_users(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    out: list[UserAdminOut] = []
    for u in users:
        storage_row = await ensure_user_storage_record(db, u)
        out.append(
            UserAdminOut(
                id=str(u.id),
                email=u.email,
                role=u.role,
                created_at=u.created_at.isoformat() if u.created_at else "",
                home_path=storage_row.home_path,
                is_provisioned=storage_row.is_provisioned,
                is_storage_active=storage_row.is_active,
            )
        )
    return out


@router.post("/users", response_model=UserAdminOut)
async def create_user(
    body: UserCreateIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu email zaten kayıtlı")
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        role=body.role if body.role in ("admin", "user") else "user",
    )
    db.add(user)
    await db.flush()
    sys_result = await db.execute(select(SystemSettings))
    sys_settings = sys_result.scalar_one_or_none()
    storage_row = await ensure_user_storage_record(db, user)
    if sys_settings and sys_settings.is_configured:
        await provision_user_storage(db, sys_settings, user)
    await db.commit()
    await db.refresh(user)
    return UserAdminOut(
        id=str(user.id),
        email=user.email,
        role=user.role,
        created_at=user.created_at.isoformat() if user.created_at else "",
        home_path=storage_row.home_path,
        is_provisioned=storage_row.is_provisioned,
        is_storage_active=storage_row.is_active,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    import uuid

    try:
        uid = uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz kullanıcı ID") from exc
    if admin.id == uid:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz")
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    await db.delete(user)
    await db.commit()
    return {"ok": True}


@router.get("/user-storage", response_model=list[UserStorageOut])
async def list_user_storage(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    result = await db.execute(
        select(User, UserStorage)
        .outerjoin(UserStorage, User.id == UserStorage.user_id)
        .order_by(User.created_at)
    )
    rows = result.all()
    out: list[UserStorageOut] = []
    for user, storage_row in rows:
        if not storage_row:
            storage_row = await ensure_user_storage_record(db, user)
        out.append(
            UserStorageOut(
                user_id=str(user.id),
                email=user.email,
                role=user.role,
                home_path=storage_row.home_path,
                quota_bytes=storage_row.quota_bytes,
                is_active=storage_row.is_active,
                is_provisioned=storage_row.is_provisioned,
            )
        )
    await db.commit()
    return out


@router.patch("/user-storage/{user_id}", response_model=UserStorageOut)
async def update_user_storage(
    user_id: str,
    body: UserStorageUpdateIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    import uuid

    try:
        uid = uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz kullanıcı ID") from exc
    user_result = await db.execute(select(User).where(User.id == uid))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    row = await ensure_user_storage_record(db, user)
    if body.quota_bytes is not None:
        row.quota_bytes = body.quota_bytes
    if body.is_active is not None:
        row.is_active = body.is_active
    if body.home_path is not None:
        row.home_path = body.home_path.strip() or row.home_path
    await db.commit()
    await db.refresh(row)
    return UserStorageOut(
        user_id=str(user.id),
        email=user.email,
        role=user.role,
        home_path=row.home_path,
        quota_bytes=row.quota_bytes,
        is_active=row.is_active,
        is_provisioned=row.is_provisioned,
    )


@router.post("/user-storage/{user_id}/provision")
async def provision_user_storage_admin(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    import uuid

    try:
        uid = uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Geçersiz kullanıcı ID") from exc
    user_result = await db.execute(select(User).where(User.id == uid))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    sys_result = await db.execute(select(SystemSettings))
    sys_settings = sys_result.scalar_one()
    row = await provision_user_storage(db, sys_settings, user)
    await db.commit()
    return {"ok": True, "home_path": row.home_path, "is_provisioned": row.is_provisioned}


@router.post("/user-storage/provision-all")
async def provision_all_storage(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    sys_result = await db.execute(select(SystemSettings))
    sys_settings = sys_result.scalar_one()
    count = await provision_all_users(db, sys_settings)
    return {"ok": True, "provisioned": count}


@router.get("/audit-logs", response_model=list[AuditLogOut])
async def audit_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    result = await db.execute(select(AuditLog).order_by(desc(AuditLog.created_at)).limit(min(limit, 200)))
    rows = result.scalars().all()
    return [
        AuditLogOut(
            id=str(r.id),
            user_email=r.user_email,
            action=r.action,
            path=r.path,
            detail=r.detail,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]


@router.get("/health-dashboard")
async def health_dashboard(db: AsyncSession = Depends(get_db), _: User = Depends(get_admin_user)):
    db_ok = False
    db_error = None
    try:
        cfg = load_db_config()
        if cfg:
            await test_db_connection(cfg)
            db_ok = True
    except Exception as exc:
        db_error = str(exc)

    storage_ok = False
    storage_error = None
    storage_info: dict = {}
    sys_settings = None
    try:
        result = await db.execute(select(SystemSettings))
        sys_settings = result.scalar_one_or_none()
        if sys_settings and sys_settings.is_configured:
            storage_info = storage.diagnose(sys_settings)
            mode = storage.effective_mode(sys_settings)
            if mode == "mount":
                storage_ok = storage_info.get("share_ok", False)
            else:
                storage_ok = storage_info.get("share_ok", False) or storage_info.get("configured_root_ok", False)
    except Exception as exc:
        storage_error = str(exc)

    uptime = int(time.time() - _start_time)
    return {
        "status": "healthy" if db_ok and storage_ok else "degraded",
        "uptime_seconds": uptime,
        "database": {"ok": db_ok, "error": db_error},
        "storage": {"ok": storage_ok, "error": storage_error, "info": storage_info},
        "storage_mode": storage.effective_mode(sys_settings) if sys_settings else "unknown",
        "mount_path": app_settings.mount_path,
    }
