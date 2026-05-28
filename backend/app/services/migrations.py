import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.bootstrap import DatabaseConfig

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_ROOT / "alembic.ini"


async def test_db_connection(cfg: DatabaseConfig) -> None:
    engine = create_async_engine(cfg.to_url(), echo=False)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    finally:
        await engine.dispose()


def run_migrations(database_url: str) -> None:
    if not ALEMBIC_INI.exists():
        raise FileNotFoundError(f"alembic.ini bulunamadı: {ALEMBIC_INI}")
    alembic_cfg = Config(str(ALEMBIC_INI))
    alembic_cfg.set_main_option("sqlalchemy.url", database_url.replace("+asyncpg", ""))
    command.upgrade(alembic_cfg, "head")


async def setup_database(cfg: DatabaseConfig) -> None:
    await test_db_connection(cfg)
    sync_url = cfg.to_url().replace("+asyncpg", "")
    await asyncio.to_thread(run_migrations, sync_url)
