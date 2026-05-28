const API = "/api";

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = "İstek başarısız";
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type SetupStep = "needs_db" | "needs_smb" | "needs_admin" | "ready";

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string | null;
}

export interface User {
  id: string;
  email: string;
  role: string;
}

export interface Me extends User {
  home_path: string;
  is_storage_active: boolean;
}

export interface ShareEntry {
  id: string;
  path: string;
  permission: string;
  owner_id: string;
  owner_email: string;
  shared_with_user_id: string;
  shared_with_email: string;
  created_at: string;
}

export interface UserStorageInfo {
  user_id: string;
  email: string;
  role: string;
  home_path: string;
  quota_bytes: number | null;
  is_active: boolean;
  is_provisioned: boolean;
}

export async function getMe() {
  return api<Me>("/auth/me");
}

export async function listUsersForShare() {
  return api<User[]>("/auth/users-list");
}

export async function createShare(path: string, sharedWithUserId: string, permission: "read" | "write") {
  return api<ShareEntry>("/shares", {
    method: "POST",
    body: JSON.stringify({ path, shared_with_user_id: sharedWithUserId, permission }),
  });
}

export async function listSharesWithMe() {
  return api<ShareEntry[]>("/shares/with-me");
}

export async function listMyShares() {
  return api<ShareEntry[]>("/shares/mine");
}

export async function revokeShare(shareId: string) {
  return api(`/shares/${shareId}`, { method: "DELETE" });
}

export async function getWorkspace() {
  return api<{ home_path: string; is_storage_active: boolean; is_provisioned: boolean; quota_bytes: number | null }>(
    "/files/workspace"
  );
}

export type SortKey = "name" | "size" | "date";
export type SortDir = "asc" | "desc";

export async function getSetupStatus() {
  return api<{ step: SetupStep; ready: boolean }>("/setup/status");
}

export function uploadFileWithProgress(
  path: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ ok: boolean; path: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", `${API}/files/upload?path=${encodeURIComponent(path)}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ ok: true, path });
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.detail || "Yükleme başarısız"));
        } catch {
          reject(new Error("Yükleme başarısız"));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Ağ hatası"));
    xhr.send(form);
  });
}

export async function uploadFile(path: string, file: File) {
  return uploadFileWithProgress(path, file);
}

export async function deletePath(path: string) {
  return api(`/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
}

export async function bulkDelete(paths: string[]) {
  return api<{ ok: boolean; errors: string[] }>("/files/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ paths }),
  });
}

export async function renamePath(oldPath: string, newPath: string) {
  return api(
    `/files/rename?old_path=${encodeURIComponent(oldPath)}&new_path=${encodeURIComponent(newPath)}`,
    { method: "PATCH" }
  );
}

export function downloadUrl(path: string) {
  return `${API}/files/download?path=${encodeURIComponent(path)}`;
}

export function downloadZipUrl(paths: string[]) {
  return `${API}/files/download-zip?paths=${encodeURIComponent(paths.join(","))}`;
}

export function previewUrl(path: string) {
  return `${API}/files/preview?path=${encodeURIComponent(path)}`;
}

export function isPreviewable(name: string): boolean {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  return ["jpg", "jpeg", "png", "gif", "webp", "pdf", "txt", "md", "json", "csv"].includes(ext || "");
}

export function parseApiError(err: unknown, fallback = "İşlem başarısız"): string {
  if (!(err instanceof Error)) return fallback;
  return err.message.replace(/^Silinemedi:\s*/i, "");
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function sortFiles(files: FileEntry[], key: SortKey, dir: SortDir): FileEntry[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...files].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    if (key === "name") return mul * a.name.localeCompare(b.name, "tr");
    if (key === "size") return mul * (a.size - b.size);
    const da = a.modified ? new Date(a.modified).getTime() : 0;
    const db = b.modified ? new Date(b.modified).getTime() : 0;
    return mul * (da - db);
  });
}

export function filterFiles(files: FileEntry[], query: string): FileEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return files;
  return files.filter((f) => f.name.toLowerCase().includes(q));
}

export interface TrashItem {
  id: string;
  original_path: string;
  trash_path: string;
  name: string;
  is_dir: boolean;
  size: number;
  deleted_at: string;
  expires_at: string;
}

export interface AuditEntry {
  id: string;
  user_email: string;
  action: string;
  path: string;
  detail: string;
  created_at: string;
}

export interface FileVersion {
  id: string;
  logical_path: string;
  version_path: string;
  size: number;
  created_by: string | null;
  created_at: string;
}

export interface ShareLink {
  id: string;
  token: string;
  path: string;
  url: string;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  meta_json: string;
  read: boolean;
  created_at: string;
}

export interface Bookmark {
  id: string;
  path: string;
  label: string;
  kind: string;
  updated_at: string;
}

export interface FileComment {
  id: string;
  path: string;
  user_id: string;
  user_email: string;
  body: string;
  created_at: string;
}

export interface UsageInfo {
  used_bytes: number;
  quota_bytes: number | null;
}

export async function listTrash() {
  return api<TrashItem[]>("/trash");
}

export async function restoreTrashItem(id: string) {
  return api<{ ok: boolean; path: string }>(`/trash/restore/${id}`, { method: "POST" });
}

export async function purgeTrashItem(id: string) {
  return api(`/trash/${id}`, { method: "DELETE" });
}

export async function getFileHistory(path: string) {
  return api<AuditEntry[]>(`/files/history?path=${encodeURIComponent(path)}`);
}

export async function getFileVersions(path: string) {
  return api<FileVersion[]>(`/files/versions?path=${encodeURIComponent(path)}`);
}

export async function restoreVersion(versionId: string) {
  return api(`/files/versions/${versionId}/restore`, { method: "POST" });
}

export async function globalSearch(q: string, scope: "all" | "home" | "shared" = "all") {
  return api<FileEntry[]>(`/files/search?q=${encodeURIComponent(q)}&scope=${scope}`);
}

export async function copyFiles(srcPaths: string[], destDir: string, onConflict = "rename") {
  return api<{ ok: boolean; copied: string[]; errors: string[] }>("/files/copy", {
    method: "POST",
    body: JSON.stringify({ src_paths: srcPaths, dest_dir: destDir, on_conflict: onConflict }),
  });
}

export async function moveFiles(srcPaths: string[], destDir: string, onConflict = "rename") {
  return api<{ ok: boolean; moved: string[]; errors: string[] }>("/files/move", {
    method: "POST",
    body: JSON.stringify({ src_paths: srcPaths, dest_dir: destDir, on_conflict: onConflict }),
  });
}

export async function getUsage() {
  return api<UsageInfo>("/files/usage");
}

export async function listNotifications() {
  return api<NotificationItem[]>("/notifications");
}

export async function getUnreadCount() {
  return api<{ count: number }>("/notifications/unread-count");
}

export async function markNotificationRead(id: string) {
  return api(`/notifications/${id}/read`, { method: "POST" });
}

export async function markAllNotificationsRead() {
  return api("/notifications/read-all", { method: "POST" });
}

export async function listBookmarks(kind?: "favorite" | "recent") {
  const q = kind ? `?kind=${kind}` : "";
  return api<Bookmark[]>(`/bookmarks${q}`);
}

export async function trackRecent(path: string) {
  return api(`/bookmarks/recent?path=${encodeURIComponent(path)}`, { method: "POST" });
}

export async function toggleFavorite(path: string, label = "") {
  return api<{ ok: boolean; favorited: boolean }>("/bookmarks/favorite", {
    method: "POST",
    body: JSON.stringify({ path, label }),
  });
}

export async function listComments(path: string) {
  return api<FileComment[]>(`/files/comments?path=${encodeURIComponent(path)}`);
}

export async function addComment(path: string, body: string) {
  return api<FileComment>("/files/comments", {
    method: "POST",
    body: JSON.stringify({ path, body }),
  });
}

export async function createShareLink(path: string, expiresHours?: number, password?: string) {
  return api<ShareLink>("/share-links", {
    method: "POST",
    body: JSON.stringify({ path, expires_hours: expiresHours ?? 168, password: password || null }),
  });
}

export async function listShareLinks() {
  return api<ShareLink[]>("/share-links");
}

export async function revokeShareLink(id: string) {
  return api(`/share-links/${id}`, { method: "DELETE" });
}

export async function getMyActivity(limit = 50) {
  return api<AuditEntry[]>(`/activity/me?limit=${limit}`);
}

export const ACTION_LABELS: Record<string, string> = {
  upload: "Yükledi",
  download: "İndirdi",
  delete: "Sildi",
  trash: "Çöpe taşıdı",
  restore: "Geri yükledi",
  purge: "Kalıcı sildi",
  mkdir: "Klasör oluşturdu",
  rename: "Yeniden adlandırdı",
  copy: "Kopyaladı",
  move: "Taşıdı",
  share: "Paylaştı",
  unshare: "Paylaşımı kaldırdı",
  comment: "Yorum yaptı",
  version_restore: "Sürüm geri yükledi",
  share_link_create: "Link oluşturdu",
};
