from app.models import SystemSettings
from app.services import storage


def unique_dest(settings: SystemSettings, dest_dir: str, name: str, on_conflict: str) -> str:
    base = storage.normalize_path(f"{dest_dir.rstrip('/')}/{name}")
    if on_conflict == "overwrite" or not storage.path_exists(settings, base):
        return base
    if on_conflict == "skip":
        return ""
    stem, ext = (name.rsplit(".", 1) + [""])[:2] if "." in name and not name.endswith("/") else (name, "")
    for i in range(1, 100):
        candidate_name = f"{stem} ({i}).{ext}" if ext else f"{name} ({i})"
        candidate = storage.normalize_path(f"{dest_dir.rstrip('/')}/{candidate_name}")
        if not storage.path_exists(settings, candidate):
            return candidate
    raise OSError("Uygun dosya adı bulunamadı")


def copy_item(settings: SystemSettings, src: str, dest: str) -> str:
    storage.copy_path(settings, src, dest)
    return dest


def move_item(settings: SystemSettings, src: str, dest: str) -> str:
    storage.rename_path(settings, src, dest)
    return dest
