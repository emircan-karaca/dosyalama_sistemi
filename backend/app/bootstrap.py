import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

from app.config import settings
from app.services.crypto import decrypt_value, encrypt_value


@dataclass
class DatabaseConfig:
    host: str
    port: int
    database: str
    username: str
    password: str

    def to_url(self) -> str:
        from urllib.parse import quote_plus

        pwd = quote_plus(self.password)
        user = quote_plus(self.username)
        return f"postgresql+asyncpg://{user}:{pwd}@{self.host}:{self.port}/{self.database}"


@dataclass
class BootstrapState:
    db_configured: bool = False
    smb_configured: bool = False
    admin_created: bool = False


def _config_path() -> Path:
    path = Path(settings.data_dir) / "config.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def load_bootstrap_state() -> BootstrapState:
    path = _config_path()
    if not path.exists():
        return BootstrapState()
    data = json.loads(path.read_text())
    return BootstrapState(
        db_configured=bool(data.get("db_configured")),
        smb_configured=bool(data.get("smb_configured")),
        admin_created=bool(data.get("admin_created")),
    )


def save_bootstrap_state(state: BootstrapState) -> None:
    path = _config_path()
    existing: dict = {}
    if path.exists():
        existing = json.loads(path.read_text())
    existing.update(asdict(state))
    path.write_text(json.dumps(existing, indent=2))


def load_db_config() -> DatabaseConfig | None:
    path = _config_path()
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    if not data.get("db_configured"):
        return None
    return DatabaseConfig(
        host=data["db_host"],
        port=int(data["db_port"]),
        database=data["db_database"],
        username=data["db_username"],
        password=decrypt_value(data["db_password_encrypted"]),
    )


def save_db_config(cfg: DatabaseConfig) -> None:
    path = _config_path()
    existing: dict = {}
    if path.exists():
        existing = json.loads(path.read_text())
    existing.update(
        {
            "db_configured": True,
            "db_host": cfg.host,
            "db_port": cfg.port,
            "db_database": cfg.database,
            "db_username": cfg.username,
            "db_password_encrypted": encrypt_value(cfg.password),
        }
    )
    path.write_text(json.dumps(existing, indent=2))
    os.chmod(path, 0o600)


def mark_smb_configured() -> None:
    state = load_bootstrap_state()
    state.smb_configured = True
    save_bootstrap_state(state)


def mark_admin_created() -> None:
    state = load_bootstrap_state()
    state.admin_created = True
    save_bootstrap_state(state)


def get_setup_step() -> str:
    state = load_bootstrap_state()
    if not state.db_configured:
        return "needs_db"
    if not state.smb_configured:
        return "needs_smb"
    if not state.admin_created:
        return "needs_admin"
    return "ready"
