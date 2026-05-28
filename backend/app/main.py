import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.bootstrap import get_setup_step, load_db_config
from app.config import settings
from app.database import get_db, init_engine_from_config
from app.models import SystemSettings
from app.routers import activity, admin, auth, bookmarks, files, notifications, setup, share_links, shares, trash
from app.services.migrations import run_migrations
from app.services.trash import purge_expired_trash


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = load_db_config()
    if cfg is not None:
        init_engine_from_config()
        sync_url = cfg.to_url().replace("+asyncpg", "")
        await asyncio.to_thread(run_migrations, sync_url)
        try:
            from app.database import get_engine
            from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
            from sqlalchemy import select

            engine = get_engine()
            factory = async_sessionmaker(engine, expire_on_commit=False)
            async with factory() as db:
                result = await db.execute(select(SystemSettings))
                settings = result.scalar_one_or_none()
                if settings and settings.is_configured:
                    await purge_expired_trash(db, settings)
        except Exception:
            pass
    yield


app = FastAPI(title="Dosyalama Sistemi", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(setup.router)
app.include_router(auth.router)
app.include_router(files.router)
app.include_router(shares.router)
app.include_router(trash.router)
app.include_router(notifications.router)
app.include_router(bookmarks.router)
app.include_router(activity.router)
app.include_router(share_links.router)
app.include_router(share_links.public_router)
app.include_router(admin.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "setup_step": get_setup_step()}


@app.get("/api/public/disk-name")
async def public_disk_name():
    step = get_setup_step()
    if step != "ready":
        return {"disk_display_name": "Dosyalama Sistemi"}
    from app.database import get_engine
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    engine = get_engine()
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        result = await db.execute(select(SystemSettings))
        row = result.scalar_one_or_none()
        name = row.disk_display_name if row else "Depolama"
    return {"disk_display_name": name}
