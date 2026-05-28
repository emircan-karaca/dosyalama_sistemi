import io
import os
import errno
import time
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import BinaryIO, TypeVar

import smbclient

from app.models import SystemSettings
from app.services.crypto import decrypt_value

T = TypeVar("T")

SKIP_NAMES = {".", "..", ".DS_Store", "Thumbs.db", "desktop.ini", "$RECYCLE.BIN", "System Volume Information", ".trash", ".versions"}


@dataclass
class FileEntry:
    name: str
    path: str
    is_dir: bool
    size: int
    modified: datetime | None


def _unc_base(settings: SystemSettings) -> str:
    root = (settings.smb_root_path or "/").strip("/")
    base = f"\\\\{settings.smb_host}\\{settings.smb_share}"
    if root:
        base = f"{base}\\{root.replace('/', '\\')}"
    return base


def _share_root_unc(settings: SystemSettings) -> str:
    return f"\\\\{settings.smb_host}\\{settings.smb_share}"


def _join_unc(base: str, rel_path: str) -> str:
    rel = rel_path.strip("/").replace("/", "\\")
    if rel:
        return f"{base}\\{rel}"
    return base


def _register_session(settings: SystemSettings) -> None:
    password = decrypt_value(settings.smb_password_encrypted) if settings.smb_password_encrypted else ""
    smbclient.register_session(
        settings.smb_host,
        username=settings.smb_username or None,
        password=password or None,
        port=445,
        connection_timeout=30,
    )


def _reset_connection(settings: SystemSettings) -> None:
    try:
        smbclient.reset_connection_cache()
    except Exception:
        pass
    _register_session(settings)


def _should_skip(name: str) -> bool:
    if name in SKIP_NAMES:
        return True
    if name.startswith("~$"):
        return True
    return False


def _humanize_smb_error(exc: Exception, path: str, *, operation: str = "generic") -> str:
    msg = str(exc)
    name = path.strip("/").split("/")[-1] or path or "paylaşım"

    if "STATUS_DELETE_PENDING" in msg:
        if operation == "list":
            return (
                "SMB klasörüne erişilemiyor — dosya silinmemiş olsa bile başka program "
                "(Finder, Windows Gezgini) klasörü kilitlemiş olabilir. "
                "Finder'da bağlantıyı çıkartın, 10 sn bekleyin. "
                "Ayarlar → 'Kök Klasörü / Yap' veya 'Bağlantıyı Sıfırla' deneyin."
            )
        return (
            f'"{name}" şu an kullanılamıyor — başka bir programda açık olabilir '
            "(Finder, Windows Gezgini). Bağlantıyı kapatıp tekrar deneyin."
        )
    if "STATUS_DIRECTORY_NOT_EMPTY" in msg or "not empty" in msg.lower():
        return f'"{name}" klasörü boş değil.'
    if "STATUS_ACCESS_DENIED" in msg:
        return f'"{name}" için izin yok.'
    if "STATUS_OBJECT_NAME_NOT_FOUND" in msg or "No such file" in msg:
        return f'"{name}" bulunamadı.'
    return msg


def _smb_call(settings: SystemSettings, fn: Callable[[], T], *, context_path: str = "/", operation: str = "generic") -> T:
    last: Exception | None = None
    for attempt in range(5):
        try:
            _reset_connection(settings)
            return fn()
        except OSError as exc:
            last = exc
            err = str(exc)
            if ("STATUS_DELETE_PENDING" in err or "STATUS_FILE_CLOSED" in err) and attempt < 4:
                time.sleep(1.0 * (attempt + 1))
                continue
            raise OSError(_humanize_smb_error(exc, context_path, operation=operation)) from exc
        except Exception as exc:
            raise OSError(_humanize_smb_error(exc, context_path, operation=operation)) from exc
    if last:
        raise OSError(_humanize_smb_error(last, context_path, operation=operation)) from last
    raise OSError("SMB işlemi başarısız")


def _resolve_unc(settings: SystemSettings, rel_path: str) -> str:
    share = _share_root_unc(settings)
    root = (settings.smb_root_path or "/").strip("/")
    parts: list[str] = []
    if root:
        parts.extend(p for p in root.replace("\\", "/").split("/") if p)
    rel = normalize_path(rel_path).strip("/")
    if rel:
        parts.extend(p for p in rel.split("/") if p)
    if parts:
        return share + "\\" + "\\".join(parts)
    return share


def _collect_entries(unc: str, norm: str) -> list[FileEntry]:
    entries: list[FileEntry] = []
    try:
        iterator = smbclient.scandir(unc)
        for item in iterator:
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
                    is_dir=bool(item.is_dir()),
                    size=int(stat.st_size) if stat else 0,
                    modified=datetime.fromtimestamp(stat.st_mtime) if stat and stat.st_mtime else None,
                )
            )
    except OSError as exc:
        if "STATUS_DELETE_PENDING" not in str(exc):
            raise
        # listdir + stat yedek yolu
        for name in smbclient.listdir(unc):
            if _should_skip(name):
                continue
            child = f"{unc}\\{name}"
            rel = f"{norm.rstrip('/')}/{name}".replace("//", "/")
            if not rel.startswith("/"):
                rel = "/" + rel
            is_dir = _stat_is_dir(child)
            size = 0
            modified = None
            try:
                st = smbclient.stat(child)
                size = int(st.st_size) if not is_dir else 0
                modified = datetime.fromtimestamp(st.st_mtime) if st.st_mtime else None
            except OSError:
                pass
            entries.append(FileEntry(name=name, path=rel, is_dir=is_dir, size=size, modified=modified))
    entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
    return entries


def reset_smb_connections(settings: SystemSettings) -> None:
    _reset_connection(settings)


def diagnose_smb(settings: SystemSettings) -> dict:
    _reset_connection(settings)
    share = _share_root_unc(settings)
    root = (settings.smb_root_path or "/").strip("/")
    root_unc = f"{share}\\{root.replace('/', '\\')}" if root else share

    result: dict = {
        "share_path": share,
        "root_path": root_unc,
        "share_ok": False,
        "configured_root_ok": False,
        "share_entries": [],
        "hint": "",
    }

    try:
        result["share_entries"] = [n for n in smbclient.listdir(share) if not _should_skip(n)][:20]
        result["share_ok"] = True
    except OSError as exc:
        result["share_error"] = str(exc)

    try:
        smbclient.listdir(root_unc)
        result["configured_root_ok"] = True
    except OSError as exc:
        result["root_error"] = str(exc)

    if result["share_ok"] and not result["configured_root_ok"] and root:
        result["hint"] = (
            f"Paylaşım ({settings.smb_share}) açılıyor ama '{root}' klasörüne erişilemiyor. "
            "Kök Klasör'ü '/' yapıp docs klasörüne arayüzden girin."
        )
    elif not result["share_ok"]:
        result["hint"] = "SMB paylaşımına hiç erişilemiyor — sunucu, kullanıcı veya şifreyi kontrol edin."

    return result


def test_connection(host: str, share: str, username: str, password: str, root_path: str = "/") -> None:
    smbclient.register_session(host, username=username or None, password=password or None)
    root = root_path.strip("/").replace("/", "\\")
    unc = f"\\\\{host}\\{share}"
    if root:
        unc = f"{unc}\\{root}"
    list(smbclient.scandir(unc))


def _stat_is_dir(unc: str) -> bool:
    try:
        return smbclient.path.isdir(unc)
    except OSError:
        return False


def _mkdir_p(unc: str) -> None:
    """Create a directory and any missing parents on the SMB share."""
    parts = [p for p in unc.split("\\") if p]
    if len(parts) < 2:
        return

    current = f"\\\\{parts[0]}\\{parts[1]}"
    for part in parts[2:]:
        current = f"{current}\\{part}"
        try:
            smbclient.mkdir(current)
        except OSError as exc:
            if getattr(exc, "errno", None) == errno.EEXIST or _stat_is_dir(current):
                continue
            err = str(exc)
            if "STATUS_OBJECT_NAME_COLLISION" in err or "already exists" in err.lower():
                continue
            raise


def list_files(settings: SystemSettings, path: str) -> list[FileEntry]:
    norm = normalize_path(path)

    def _list() -> list[FileEntry]:
        unc = _resolve_unc(settings, norm)
        return _collect_entries(unc, norm)

    return _smb_call(settings, _list, context_path=norm, operation="list")


def mkdir(settings: SystemSettings, path: str) -> None:
    norm = normalize_path(path)

    def _mkdir() -> None:
        unc = _resolve_unc(settings, norm)
        _mkdir_p(unc)

    _smb_call(settings, _mkdir, context_path=norm, operation="generic")


def _safe_unlink(unc: str, settings: SystemSettings, retries: int = 4) -> None:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            _register_session(settings)
            smbclient.remove(unc)
            return
        except OSError as exc:
            last = exc
            if "STATUS_DELETE_PENDING" in str(exc) and attempt < retries - 1:
                _reset_connection(settings)
                time.sleep(0.6 * (attempt + 1))
                continue
            raise
    if last:
        raise last


def _safe_rmdir(unc: str, settings: SystemSettings, retries: int = 4) -> None:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            _register_session(settings)
            smbclient.rmdir(unc)
            return
        except OSError as exc:
            last = exc
            if "STATUS_DELETE_PENDING" in str(exc) and attempt < retries - 1:
                _reset_connection(settings)
                time.sleep(0.6 * (attempt + 1))
                continue
            raise
    if last:
        raise last


def _delete_tree(unc: str, settings: SystemSettings) -> None:
    for entry in smbclient.scandir(unc):
        if entry.name in (".", ".."):
            continue
        child = f"{unc}\\{entry.name}"
        if entry.is_dir():
            _delete_tree(child, settings)
        else:
            _safe_unlink(child, settings)
    _safe_rmdir(unc, settings)


def delete_path(settings: SystemSettings, path: str, is_dir: bool | None = None) -> None:
    norm = normalize_path(path)
    if norm == "/":
        raise OSError("Kök dizin silinemez.")

    def _delete() -> None:
        unc = _resolve_unc(settings, norm)
        if _stat_is_dir(unc):
            _delete_tree(unc, settings)
        else:
            _safe_unlink(unc, settings)

    _smb_call(settings, _delete, context_path=norm, operation="delete")


def rename_path(settings: SystemSettings, old_path: str, new_path: str) -> None:
    old_norm = normalize_path(old_path)
    new_norm = normalize_path(new_path)

    def _rename() -> None:
        smbclient.rename(_resolve_unc(settings, old_norm), _resolve_unc(settings, new_norm))

    _smb_call(settings, _rename, context_path=old_norm, operation="generic")


def upload_file(settings: SystemSettings, path: str, file_obj: BinaryIO) -> None:
    norm = normalize_path(path)

    def _upload() -> None:
        unc = _resolve_unc(settings, norm)
        parent = os.path.dirname(unc)
        if parent and parent != unc:
            _mkdir_p(parent)
        with smbclient.open_file(unc, mode="wb") as remote:
            remote.write(file_obj.read())

    _smb_call(settings, _upload, context_path=norm, operation="generic")


def download_file(settings: SystemSettings, path: str) -> tuple[BinaryIO, str]:
    norm = normalize_path(path)

    def _download() -> tuple[BinaryIO, str]:
        unc = _resolve_unc(settings, norm)
        buf = io.BytesIO()
        with smbclient.open_file(unc, mode="rb") as remote:
            buf.write(remote.read())
        buf.seek(0)
        return buf, norm.strip("/").split("/")[-1]

    return _smb_call(settings, _download, context_path=norm, operation="generic")


def _zip_add_tree(zf: zipfile.ZipFile, settings: SystemSettings, norm: str, arc_prefix: str) -> None:
    unc = _resolve_unc(settings, norm)

    def _walk() -> None:
        if _stat_is_dir(unc):
            for entry in smbclient.scandir(unc):
                if entry.name in (".", "..") or _should_skip(entry.name):
                    continue
                child_norm = f"{norm.rstrip('/')}/{entry.name}".replace("//", "/")
                if not child_norm.startswith("/"):
                    child_norm = "/" + child_norm
                child_arc = f"{arc_prefix}/{entry.name}" if arc_prefix else entry.name
                if entry.is_dir():
                    _zip_add_tree(zf, settings, child_norm, child_arc)
                else:
                    child_unc = f"{unc}\\{entry.name}"
                    data = io.BytesIO()
                    with smbclient.open_file(child_unc, mode="rb") as remote:
                        data.write(remote.read())
                    zf.writestr(child_arc.replace("\\", "/"), data.getvalue())
        else:
            buf, name = download_file(settings, norm)
            zf.writestr(arc_prefix or name, buf.read())

    _smb_call(settings, _walk, context_path=norm, operation="generic")


def build_zip(settings: SystemSettings, paths: list[str]) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in paths:
            norm = normalize_path(p)
            name = norm.strip("/").split("/")[-1] or "download"
            _zip_add_tree(zf, settings, norm, name)
    buf.seek(0)
    return buf


def path_exists(settings: SystemSettings, path: str) -> bool:
    norm = normalize_path(path)

    def _exists() -> bool:
        unc = _resolve_unc(settings, norm)
        try:
            smbclient.stat(unc)
            return True
        except OSError:
            return False

    return _smb_call(settings, _exists, context_path=norm, operation="generic")


def path_is_dir(settings: SystemSettings, path: str) -> bool:
    norm = normalize_path(path)

    def _is_dir() -> bool:
        return _stat_is_dir(_resolve_unc(settings, norm))

    return _smb_call(settings, _is_dir, context_path=norm, operation="generic")


def path_size(settings: SystemSettings, path: str) -> int:
    norm = normalize_path(path)

    def _size() -> int:
        unc = _resolve_unc(settings, norm)
        if not _stat_is_dir(unc):
            try:
                return int(smbclient.stat(unc).st_size)
            except OSError:
                return 0

        total = 0

        def walk(u: str) -> None:
            nonlocal total
            for entry in smbclient.scandir(u):
                if entry.name in (".", "..") or _should_skip(entry.name):
                    continue
                child = f"{u}\\{entry.name}"
                if entry.is_dir():
                    walk(child)
                else:
                    try:
                        total += int(entry.stat().st_size)
                    except OSError:
                        pass

        walk(unc)
        return total

    return _smb_call(settings, _size, context_path=norm, operation="generic")


def _copy_tree(settings: SystemSettings, src_unc: str, dest_unc: str) -> None:
    if _stat_is_dir(src_unc):
        _mkdir_p(dest_unc)
        for entry in smbclient.scandir(src_unc):
            if entry.name in (".", "..") or _should_skip(entry.name):
                continue
            child_src = f"{src_unc}\\{entry.name}"
            child_dest = f"{dest_unc}\\{entry.name}"
            if entry.is_dir():
                _copy_tree(settings, child_src, child_dest)
            else:
                parent = os.path.dirname(child_dest)
                if parent:
                    _mkdir_p(parent)
                with smbclient.open_file(child_src, mode="rb") as src_f:
                    data = src_f.read()
                with smbclient.open_file(child_dest, mode="wb") as dest_f:
                    dest_f.write(data)
    else:
        parent = os.path.dirname(dest_unc)
        if parent:
            _mkdir_p(parent)
        with smbclient.open_file(src_unc, mode="rb") as src_f:
            data = src_f.read()
        with smbclient.open_file(dest_unc, mode="wb") as dest_f:
            dest_f.write(data)


def copy_path(settings: SystemSettings, src_path: str, dest_path: str) -> None:
    src_norm = normalize_path(src_path)
    dest_norm = normalize_path(dest_path)

    def _copy() -> None:
        _copy_tree(settings, _resolve_unc(settings, src_norm), _resolve_unc(settings, dest_norm))

    _smb_call(settings, _copy, context_path=src_norm, operation="generic")


def search_files(
    settings: SystemSettings,
    root_path: str,
    query: str,
    *,
    max_results: int = 100,
    max_depth: int = 8,
) -> list[FileEntry]:
    norm = normalize_path(root_path)
    q = query.strip().lower()
    if not q:
        return []

    results: list[FileEntry] = []

    def walk(unc: str, rel: str, depth: int) -> None:
        if len(results) >= max_results or depth > max_depth:
            return
        try:
            entries = list(smbclient.scandir(unc))
        except OSError:
            return
        for entry in entries:
            if entry.name in (".", "..") or _should_skip(entry.name):
                continue
            child_rel = f"{rel.rstrip('/')}/{entry.name}".replace("//", "/")
            if not child_rel.startswith("/"):
                child_rel = "/" + child_rel
            if q in entry.name.lower():
                stat = entry.stat()
                results.append(
                    FileEntry(
                        name=entry.name,
                        path=child_rel,
                        is_dir=bool(entry.is_dir()),
                        size=int(stat.st_size) if stat and not entry.is_dir() else 0,
                        modified=datetime.fromtimestamp(stat.st_mtime) if stat and stat.st_mtime else None,
                    )
                )
                if len(results) >= max_results:
                    return
            if entry.is_dir():
                walk(f"{unc}\\{entry.name}", child_rel, depth + 1)

    def _search() -> list[FileEntry]:
        walk(_resolve_unc(settings, norm), norm, 0)
        return results

    return _smb_call(settings, _search, context_path=norm, operation="list")


def normalize_path(path: str) -> str:
    path = path.replace("\\", "/")
    if not path.startswith("/"):
        path = "/" + path
    parts: list[str] = []
    for part in path.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            if parts:
                parts.pop()
            continue
        parts.append(part)
    return "/" + "/".join(parts) if parts else "/"
