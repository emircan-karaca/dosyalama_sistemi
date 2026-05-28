import io
import os
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

from app.config import settings as app_settings
from app.models import SystemSettings
from app.services.smb import FileEntry, normalize_path

SKIP_NAMES = {".", "..", ".DS_Store", "Thumbs.db", "desktop.ini", "$RECYCLE.BIN", "System Volume Information", ".trash", ".versions"}


def _mount_base(settings: SystemSettings) -> Path:
    base = Path(app_settings.mount_path)
    root = (settings.smb_root_path or "/").strip("/")
    if root:
        return base / root.replace("/", os.sep)
    return base


def _resolve_local(settings: SystemSettings, rel_path: str) -> Path:
    base = _mount_base(settings)
    norm = normalize_path(rel_path).strip("/")
    if norm:
        return base / norm.replace("/", os.sep)
    return base


def _should_skip(name: str) -> bool:
    if name in SKIP_NAMES or name.startswith("~$"):
        return True
    return False


def _collect_entries(local_dir: Path, norm: str) -> list[FileEntry]:
    entries: list[FileEntry] = []
    if not local_dir.is_dir():
        raise OSError(f"Klasör bulunamadı: {norm}")
    for item in local_dir.iterdir():
        if _should_skip(item.name):
            continue
        rel = f"{norm.rstrip('/')}/{item.name}".replace("//", "/")
        if not rel.startswith("/"):
            rel = "/" + rel
        stat = item.stat()
        entries.append(
            FileEntry(
                name=item.name,
                path=rel,
                is_dir=item.is_dir(),
                size=int(stat.st_size) if item.is_file() else 0,
                modified=datetime.fromtimestamp(stat.st_mtime),
            )
        )
    entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
    return entries


def list_files(settings: SystemSettings, path: str) -> list[FileEntry]:
    norm = normalize_path(path)
    return _collect_entries(_resolve_local(settings, norm), norm)


def mkdir(settings: SystemSettings, path: str) -> None:
    norm = normalize_path(path)
    _resolve_local(settings, norm).mkdir(parents=True, exist_ok=True)


def delete_path(settings: SystemSettings, path: str, is_dir: bool | None = None) -> None:
    norm = normalize_path(path)
    if norm == "/":
        raise OSError("Kök dizin silinemez.")
    target = _resolve_local(settings, norm)
    if target.is_dir():
        shutil.rmtree(target)
    elif target.is_file():
        target.unlink()
    else:
        raise OSError(f"Bulunamadı: {norm}")


def rename_path(settings: SystemSettings, old_path: str, new_path: str) -> None:
    old = _resolve_local(settings, normalize_path(old_path))
    new = _resolve_local(settings, normalize_path(new_path))
    new.parent.mkdir(parents=True, exist_ok=True)
    old.rename(new)


def path_exists(settings: SystemSettings, path: str) -> bool:
    return _resolve_local(settings, normalize_path(path)).exists()


def path_is_dir(settings: SystemSettings, path: str) -> bool:
    target = _resolve_local(settings, normalize_path(path))
    return target.is_dir()


def path_size(settings: SystemSettings, path: str) -> int:
    target = _resolve_local(settings, normalize_path(path))
    if not target.exists():
        return 0
    if target.is_file():
        return target.stat().st_size

    total = 0
    for root, _dirs, files in os.walk(target):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                pass
    return total


def search_files(
    settings: SystemSettings,
    root_path: str,
    query: str,
    *,
    max_results: int = 100,
    max_depth: int = 8,
) -> list[FileEntry]:
    norm = normalize_path(root_path)
    root = _resolve_local(settings, norm)
    q = query.strip().lower()
    if not q or not root.is_dir():
        return []

    results: list[FileEntry] = []

    def walk(local: Path, rel: str, depth: int) -> None:
        if len(results) >= max_results or depth > max_depth:
            return
        try:
            items = list(local.iterdir())
        except OSError:
            return
        for item in items:
            if _should_skip(item.name):
                continue
            child_rel = f"{rel.rstrip('/')}/{item.name}".replace("//", "/")
            if not child_rel.startswith("/"):
                child_rel = "/" + child_rel
            if q in item.name.lower():
                stat = item.stat()
                results.append(
                    FileEntry(
                        name=item.name,
                        path=child_rel,
                        is_dir=item.is_dir(),
                        size=int(stat.st_size) if item.is_file() else 0,
                        modified=datetime.fromtimestamp(stat.st_mtime),
                    )
                )
                if len(results) >= max_results:
                    return
            if item.is_dir():
                walk(item, child_rel, depth + 1)

    walk(root, norm, 0)
    return results


def upload_file(settings: SystemSettings, path: str, file_obj: BinaryIO) -> None:
    norm = normalize_path(path)
    target = _resolve_local(settings, norm)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "wb") as f:
        f.write(file_obj.read())


def download_file(settings: SystemSettings, path: str) -> tuple[BinaryIO, str]:
    norm = normalize_path(path)
    target = _resolve_local(settings, norm)
    if not target.is_file():
        raise OSError(f"Dosya bulunamadı: {norm}")
    buf = io.BytesIO()
    with open(target, "rb") as f:
        buf.write(f.read())
    buf.seek(0)
    return buf, target.name


def copy_path(settings: SystemSettings, src_path: str, dest_path: str) -> None:
    src = _resolve_local(settings, normalize_path(src_path))
    dest = _resolve_local(settings, normalize_path(dest_path))
    if src.is_dir():
        shutil.copytree(src, dest)
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)


def _add_to_zip(zf: zipfile.ZipFile, local_path: Path, arc_prefix: str) -> None:
    if local_path.is_file():
        zf.write(local_path, arcname=arc_prefix or local_path.name)
        return
    for root, _dirs, files in os.walk(local_path):
        root_path = Path(root)
        for name in files:
            full = root_path / name
            rel = full.relative_to(local_path)
            arc = f"{arc_prefix}/{rel}".replace("\\", "/") if arc_prefix else str(rel).replace("\\", "/")
            zf.write(full, arcname=arc)


def build_zip(settings: SystemSettings, paths: list[str]) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in paths:
            norm = normalize_path(p)
            local = _resolve_local(settings, norm)
            if not local.exists():
                continue
            name = norm.strip("/").split("/")[-1] or "download"
            _add_to_zip(zf, local, name)
    buf.seek(0)
    return buf


def diagnose(settings: SystemSettings) -> dict:
    base = _mount_base(settings)
    result: dict = {
        "mode": "mount",
        "mount_path": str(base),
        "share_ok": False,
        "configured_root_ok": False,
        "share_entries": [],
        "hint": "",
    }
    mount_root = Path(app_settings.mount_path)
    try:
        if mount_root.is_dir():
            result["share_entries"] = [n.name for n in mount_root.iterdir() if not _should_skip(n.name)][:20]
            result["share_ok"] = True
    except OSError as exc:
        result["share_error"] = str(exc)
    try:
        if base.is_dir():
            list(base.iterdir())
            result["configured_root_ok"] = True
    except OSError as exc:
        result["root_error"] = str(exc)
    if not result["share_ok"]:
        result["hint"] = "Mount dizini erişilemiyor. CIFS mount kontrol edin."
    elif not result["configured_root_ok"]:
        result["hint"] = "Kök klasör mount altında bulunamadı. smb_root_path ayarını kontrol edin."
    return result


def test_mount(settings: SystemSettings) -> None:
    base = _mount_base(settings)
    if not base.is_dir():
        raise OSError(f"Mount dizini yok: {base}")
    list(base.iterdir())
