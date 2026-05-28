from pydantic import BaseModel, EmailStr, Field


class DbConfigIn(BaseModel):
    host: str = Field(min_length=1)
    port: int = 5432
    database: str = Field(min_length=1)
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class SmbConfigIn(BaseModel):
    disk_display_name: str = Field(min_length=1, max_length=255)
    smb_host: str = Field(min_length=1)
    smb_share: str = Field(min_length=1)
    smb_username: str = ""
    smb_password: str = ""
    smb_root_path: str = "/"


class AdminCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class FileEntryOut(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: int
    modified: str | None


class UserOut(BaseModel):
    id: str
    email: str
    role: str


class MeOut(BaseModel):
    id: str
    email: str
    role: str
    home_path: str
    is_storage_active: bool


class ShareCreateIn(BaseModel):
    path: str
    shared_with_user_id: str
    permission: str = "read"


class ShareOut(BaseModel):
    id: str
    path: str
    permission: str
    owner_id: str
    owner_email: str
    shared_with_user_id: str
    shared_with_email: str
    created_at: str


class UserStorageOut(BaseModel):
    user_id: str
    email: str
    role: str
    home_path: str
    quota_bytes: int | None
    is_active: bool
    is_provisioned: bool


class UserStorageUpdateIn(BaseModel):
    quota_bytes: int | None = None
    is_active: bool | None = None
    home_path: str | None = None


class SettingsOut(BaseModel):
    disk_display_name: str
    smb_host: str
    smb_share: str
    smb_username: str
    smb_root_path: str
    storage_mode: str
    has_smb_password: bool


class SettingsUpdateIn(BaseModel):
    disk_display_name: str | None = None
    smb_host: str | None = None
    smb_share: str | None = None
    smb_username: str | None = None
    smb_password: str | None = None
    smb_root_path: str | None = None
    storage_mode: str | None = None


class BulkDeleteIn(BaseModel):
    paths: list[str] = Field(min_length=1)


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class UserCreateIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = "user"


class UserAdminOut(BaseModel):
    id: str
    email: str
    role: str
    created_at: str
    home_path: str | None = None
    is_provisioned: bool | None = None
    is_storage_active: bool | None = None


class AuditLogOut(BaseModel):
    id: str
    user_email: str
    action: str
    path: str
    detail: str
    created_at: str


class TrashItemOut(BaseModel):
    id: str
    original_path: str
    trash_path: str
    name: str
    is_dir: bool
    size: int
    deleted_at: str
    expires_at: str


class FileVersionOut(BaseModel):
    id: str
    logical_path: str
    version_path: str
    size: int
    created_by: str | None
    created_at: str


class CopyMoveIn(BaseModel):
    src_paths: list[str] = Field(min_length=1)
    dest_dir: str
    on_conflict: str = "rename"


class ShareLinkCreateIn(BaseModel):
    path: str
    expires_hours: int | None = 168
    password: str | None = None
    max_downloads: int | None = None


class ShareLinkOut(BaseModel):
    id: str
    token: str
    path: str
    url: str
    expires_at: str | None
    max_downloads: int | None
    download_count: int
    created_at: str


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    meta_json: str
    read: bool
    created_at: str


class BookmarkOut(BaseModel):
    id: str
    path: str
    label: str
    kind: str
    updated_at: str


class BookmarkToggleIn(BaseModel):
    path: str
    label: str = ""


class FileCommentOut(BaseModel):
    id: str
    path: str
    user_id: str
    user_email: str
    body: str
    created_at: str


class FileCommentCreateIn(BaseModel):
    path: str
    body: str = Field(min_length=1, max_length=2000)


class UsageOut(BaseModel):
    used_bytes: int
    quota_bytes: int | None


class DbConfigOut(BaseModel):
    host: str
    port: int
    database: str
    username: str
