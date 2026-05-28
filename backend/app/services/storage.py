import io

from app.config import settings as app_settings
from app.models import SystemSettings
from app.services import local_storage, smb as smb_storage
from app.services.smb import FileEntry, normalize_path


def effective_mode(settings: SystemSettings) -> str:
    mode = (settings.storage_mode or app_settings.storage_mode or "smb").lower()
    return "mount" if mode == "mount" else "smb"


def list_files(settings: SystemSettings, path: str) -> list[FileEntry]:
    if effective_mode(settings) == "mount":
        return local_storage.list_files(settings, path)
    return smb_storage.list_files(settings, path)


def mkdir(settings: SystemSettings, path: str) -> None:
    if effective_mode(settings) == "mount":
        local_storage.mkdir(settings, path)
    else:
        smb_storage.mkdir(settings, path)


def delete_path(settings: SystemSettings, path: str, is_dir: bool | None = None) -> None:
    if effective_mode(settings) == "mount":
        local_storage.delete_path(settings, path, is_dir)
    else:
        smb_storage.delete_path(settings, path, is_dir)


def rename_path(settings: SystemSettings, old_path: str, new_path: str) -> None:
    if effective_mode(settings) == "mount":
        local_storage.rename_path(settings, old_path, new_path)
    else:
        smb_storage.rename_path(settings, old_path, new_path)


def copy_path(settings: SystemSettings, src_path: str, dest_path: str) -> None:
    if effective_mode(settings) == "mount":
        local_storage.copy_path(settings, src_path, dest_path)
    else:
        smb_storage.copy_path(settings, src_path, dest_path)


def path_exists(settings: SystemSettings, path: str) -> bool:
    if effective_mode(settings) == "mount":
        return local_storage.path_exists(settings, path)
    return smb_storage.path_exists(settings, path)


def path_is_dir(settings: SystemSettings, path: str) -> bool:
    if effective_mode(settings) == "mount":
        return local_storage.path_is_dir(settings, path)
    return smb_storage.path_is_dir(settings, path)


def path_size(settings: SystemSettings, path: str) -> int:
    if effective_mode(settings) == "mount":
        return local_storage.path_size(settings, path)
    return smb_storage.path_size(settings, path)


def search_files(settings: SystemSettings, root_path: str, query: str, *, max_results: int = 100, max_depth: int = 8) -> list[FileEntry]:
    if effective_mode(settings) == "mount":
        return local_storage.search_files(settings, root_path, query, max_results=max_results, max_depth=max_depth)
    return smb_storage.search_files(settings, root_path, query, max_results=max_results, max_depth=max_depth)


def upload_file(settings: SystemSettings, path: str, file_obj) -> None:
    if effective_mode(settings) == "mount":
        local_storage.upload_file(settings, path, file_obj)
    else:
        smb_storage.upload_file(settings, path, file_obj)


def download_file(settings: SystemSettings, path: str):
    if effective_mode(settings) == "mount":
        return local_storage.download_file(settings, path)
    return smb_storage.download_file(settings, path)


def build_zip(settings: SystemSettings, paths: list[str]) -> io.BytesIO:
    if effective_mode(settings) == "mount":
        return local_storage.build_zip(settings, paths)
    return smb_storage.build_zip(settings, paths)


def normalize_path(path: str) -> str:
    return smb_storage.normalize_path(path)


def diagnose(settings: SystemSettings) -> dict:
    if effective_mode(settings) == "mount":
        return local_storage.diagnose(settings)
    return smb_storage.diagnose_smb(settings)


def reset_connections(settings: SystemSettings) -> None:
    if effective_mode(settings) == "mount":
        return
    smb_storage.reset_smb_connections(settings)


def test_storage(settings: SystemSettings, password: str | None = None) -> None:
    if effective_mode(settings) == "mount":
        local_storage.test_mount(settings)
    else:
        pwd = password or ""
        smb_storage.test_connection(
            settings.smb_host,
            settings.smb_share,
            settings.smb_username,
            pwd,
            settings.smb_root_path,
        )


def preview_mime(path: str) -> str | None:
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    mapping = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "webp": "image/webp",
        "pdf": "application/pdf",
        "txt": "text/plain; charset=utf-8",
        "md": "text/plain; charset=utf-8",
        "json": "application/json",
        "csv": "text/plain; charset=utf-8",
    }
    return mapping.get(ext)
