from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "dev-secret-key-change-in-production"
    encryption_key: str = "dev-encryption-key-change-in-prod!"
    data_dir: str = "/data"
    cors_origins: str = "http://localhost:3000"
    mount_path: str = "/mnt/smb"
    storage_mode: str = "smb"  # smb | mount — env override; DB setting takes precedence when configured

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
