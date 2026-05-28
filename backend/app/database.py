from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.bootstrap import load_db_config

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def reset_engine() -> None:
    global _engine, _session_factory
    _engine = None
    _session_factory = None


def init_engine_from_config() -> None:
    global _engine, _session_factory
    cfg = load_db_config()
    if cfg is None:
        raise RuntimeError("Database not configured")
    _engine = create_async_engine(cfg.to_url(), echo=False, pool_pre_ping=True)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


def get_engine():
    if _engine is None:
        init_engine_from_config()
    return _engine


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    global _session_factory
    if _session_factory is None:
        init_engine_from_config()
    assert _session_factory is not None
    async with _session_factory() as session:
        yield session
