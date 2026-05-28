"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Anchor,
  AppShell,
  Breadcrumbs,
  Burger,
  Button,
  Center,
  Group,
  Loader,
  LoadingOverlay,
  Modal,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  useMantineColorScheme,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconChevronRight,
  IconCloudUpload,
  IconFolderPlus,
  IconHome,
  IconLayoutGrid,
  IconList,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconX,
  IconDownload,
} from "@tabler/icons-react";
import { AppSidebar } from "@/components/AppSidebar";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { DriveFileCard } from "@/components/DriveFileCard";
import { DriveFileRow } from "@/components/DriveFileRow";
import { FileContextMenu } from "@/components/FileContextMenu";
import { FileDetailPanel } from "@/components/FileDetailPanel";
import { FilePreviewModal } from "@/components/FilePreviewModal";
import { ShareLinkModal } from "@/components/ShareLinkModal";
import { ShareModal } from "@/components/ShareModal";
import {
  FileEntry,
  Me,
  SortDir,
  SortKey,
  UsageInfo,
  api,
  bulkDelete,
  copyFiles,
  deletePath,
  downloadZipUrl,
  filterFiles,
  formatSize,
  getMe,
  getSetupStatus,
  getUsage,
  globalSearch,
  moveFiles,
  parseApiError,
  renamePath,
  sortFiles,
  toggleFavorite,
  trackRecent,
  uploadFileWithProgress,
} from "@/lib/api";

export default function DrivePage() {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const [opened, { toggle }] = useDisclosure();

  const [user, setUser] = useState<Me | null>(null);
  const [homePath, setHomePath] = useState<string | null>(null);
  const [diskName, setDiskName] = useState("Depolama");
  const [path, setPath] = useState("/");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [folderModal, setFolderModal] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ item: FileEntry; x: number; y: number } | null>(null);
  const [detailItem, setDetailItem] = useState<FileEntry | null>(null);
  const [previewItem, setPreviewItem] = useState<FileEntry | null>(null);
  const [shareTarget, setShareTarget] = useState<string | null>(null);
  const [shareLinkTarget, setShareLinkTarget] = useState<string | null>(null);
  const [fileClipboard, setFileClipboard] = useState<{ mode: "copy" | "cut"; paths: string[] } | null>(null);
  const [globalResults, setGlobalResults] = useState<FileEntry[] | null>(null);
  const [globalSearching, setGlobalSearching] = useState(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  const [listError, setListError] = useState<string | null>(null);

  const displayFiles = useMemo(() => {
    const base = globalResults ?? files;
    return sortFiles(filterFiles(base, globalResults ? "" : search), sortKey, sortDir);
  }, [files, globalResults, search, sortKey, sortDir]);

  const loadFiles = useCallback(async (p: string) => {
    setLoading(true);
    setListError(null);
    setSelected(new Set());
    try {
      const data = await api<FileEntry[]>(`/files?path=${encodeURIComponent(p)}`);
      setFiles(data);
    } catch (e) {
      const msg = parseApiError(e, "Dosyalar yüklenemedi");
      setListError(msg);
      notifications.show({ title: "SMB Bağlantı Hatası", message: msg, color: "red", autoClose: 10000 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getSetupStatus().then((s) => {
      if (!s.ready) router.replace("/setup");
    });
    const urlPath = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("path") : null;
    Promise.all([getMe(), api<{ disk_display_name: string }>("/public/disk-name")])
      .then(([me, disk]) => {
        setUser(me);
        setDiskName(disk.disk_display_name);
        setHomePath(me.home_path);
        const raw = urlPath ? decodeURIComponent(urlPath) : me.home_path;
        const start = !raw || raw === "/" ? me.home_path : raw;
        setPath(start);
        getUsage().then(setUsage).catch(() => {});
        return loadFiles(start);
      })
      .catch(() => router.replace("/login"));
  }, [router, loadFiles]);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const items = e.clipboardData?.files;
      if (!items?.length) return;
      e.preventDefault();
      handleUpload(Array.from(items));
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [path, homePath]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selected.size > 0) {
        e.preventDefault();
        setFileClipboard({ mode: "copy", paths: [...selected] });
        notifications.show({ message: `${selected.size} öğe kopyalandı`, color: "blue" });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "x" && selected.size > 0) {
        e.preventDefault();
        setFileClipboard({ mode: "cut", paths: [...selected] });
        notifications.show({ message: `${selected.size} öğe kesildi`, color: "blue" });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && fileClipboard?.paths.length) {
        e.preventDefault();
        pasteFiles();
      }
      if (e.key === "Delete" && selected.size > 0) {
        e.preventDefault();
        setBulkDeleteOpen(true);
      }
      if (e.key === "F2" && selected.size === 1) {
        e.preventDefault();
        const p = [...selected][0];
        const item = files.find((f) => f.path === p);
        if (item) startRename(item);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelected(new Set(displayFiles.map((f) => f.path)));
      }
      if (e.key === "Escape") {
        setSelected(new Set());
        setContextMenu(null);
        setDetailItem(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, files, displayFiles, fileClipboard, path, homePath]);

  async function pasteFiles() {
    if (!fileClipboard?.paths.length) return;
    const dest = effectiveUploadPath();
    if (!dest || dest === "/") {
      notifications.show({ title: "Hata", message: "Yapıştırma için geçerli bir klasörde olun", color: "red" });
      return;
    }
    try {
      if (fileClipboard.mode === "copy") {
        const res = await copyFiles(fileClipboard.paths, dest);
        notifications.show({ title: "Kopyalandı", message: `${res.copied.length} öğe`, color: "green" });
      } else {
        const res = await moveFiles(fileClipboard.paths, dest);
        notifications.show({ title: "Taşındı", message: `${res.moved.length} öğe`, color: "green" });
        setFileClipboard(null);
      }
      await loadFiles(dest);
    } catch (e) {
      notifications.show({ title: "Hata", message: parseApiError(e), color: "red" });
    }
  }

  async function runGlobalSearch() {
    if (search.trim().length < 2) {
      setGlobalResults(null);
      return;
    }
    setGlobalSearching(true);
    try {
      const results = await globalSearch(search.trim());
      setGlobalResults(results);
      if (results.length === 0) {
        notifications.show({ message: "Sonuç bulunamadı", color: "yellow" });
      }
    } catch (e) {
      notifications.show({ title: "Arama hatası", message: parseApiError(e), color: "red" });
    } finally {
      setGlobalSearching(false);
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  function openFolder(p: string) {
    setPath(p);
    setDetailItem(null);
    setGlobalResults(null);
    loadFiles(p);
    trackRecent(p).catch(() => {});
  }

  function goUp() {
    if (!homePath || path === homePath) return;
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    const parent = parts.length ? `/${parts.join("/")}` : "/";

    if (parent === "/" || parent === homePath) {
      openFolder(homePath);
      return;
    }
    if (parent === "/users") {
      openFolder(homePath);
      return;
    }
    if (homePath && !parent.startsWith(homePath) && user?.role !== "admin") {
      openFolder(homePath);
      return;
    }
    if (user?.role !== "admin" && homePath && !parent.startsWith(homePath)) {
      openFolder(homePath);
      return;
    }
    openFolder(parent);
  }

  function goHome() {
    if (homePath) openFolder(homePath);
  }

  function canShare(item: FileEntry) {
    if (!homePath) return false;
    return item.path.startsWith(homePath);
  }

  function effectiveUploadPath() {
    if (!homePath) return path;
    if (path === "/" || path === "") return homePath;
    return path;
  }

  function toggleSelect(itemPath: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemPath);
      else next.delete(itemPath);
      return next;
    });
  }

  async function handleUpload(fileList: File[]) {
    const uploadPath = effectiveUploadPath();
    if (!uploadPath || uploadPath === "/") {
      notifications.show({ title: "Hata", message: "Dosyalar yalnızca Depolamam klasörüne yüklenebilir", color: "red" });
      return;
    }
    setUploading(true);
    try {
      for (const file of fileList) {
        setUploadFileName(file.name);
        setUploadProgress(0);
        await uploadFileWithProgress(uploadPath, file, setUploadProgress);
        notifications.show({
          title: "Yükleme Başarılı",
          message: `${file.name} yüklendi`,
          color: "green",
          icon: <IconCheck size={16} />,
        });
      }
      setPath(uploadPath);
      await loadFiles(uploadPath);
    } catch (e) {
      notifications.show({ title: "Yükleme Başarısız", message: parseApiError(e), color: "red" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadFileName("");
    }
  }

  async function createFolder() {
    if (!newFolder.trim()) return;
    const base = effectiveUploadPath();
    if (!base || base === "/") {
      notifications.show({ title: "Hata", message: "Klasör yalnızca Depolamam içinde oluşturulabilir", color: "red" });
      return;
    }
    const folderPath = `${base}/${newFolder.trim()}`;
    try {
      await api(`/files/mkdir?path=${encodeURIComponent(folderPath)}`, { method: "POST" });
      notifications.show({ title: "Başarılı", message: "Klasör oluşturuldu", color: "green" });
      setFolderModal(false);
      setNewFolder("");
      setPath(base);
      await loadFiles(base);
    } catch (e) {
      notifications.show({ title: "Hata", message: parseApiError(e), color: "red" });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePath(deleteTarget.path);
      notifications.show({ title: "Silindi", message: deleteTarget.name, color: "green" });
      setDeleteTarget(null);
      await loadFiles(path);
    } catch (e) {
      notifications.show({ title: "Silinemedi", message: parseApiError(e), color: "red", autoClose: 8000 });
    } finally {
      setDeleting(false);
    }
  }

  async function confirmBulkDelete() {
    setDeleting(true);
    try {
      const paths = [...selected];
      const res = await bulkDelete(paths);
      if (res.errors?.length) {
        notifications.show({
          title: "Kısmen silindi",
          message: res.errors.join("; "),
          color: "yellow",
        });
      } else {
        notifications.show({ title: "Silindi", message: `${paths.length} öğe silindi`, color: "green" });
      }
      setBulkDeleteOpen(false);
      await loadFiles(path);
    } catch (e) {
      notifications.show({ title: "Silinemedi", message: parseApiError(e), color: "red" });
    } finally {
      setDeleting(false);
    }
  }

  async function confirmRename() {
    if (!renameTarget || !renameValue.trim()) return;
    const parent = renameTarget.path.split("/").slice(0, -1).join("/") || "";
    const newPath = `${parent}/${renameValue.trim()}`.replace("//", "/");
    setRenaming(true);
    try {
      await renamePath(renameTarget.path, newPath.startsWith("/") ? newPath : `/${newPath}`);
      notifications.show({ title: "Başarılı", message: "Yeniden adlandırıldı", color: "green" });
      setRenameTarget(null);
      setRenameValue("");
      await loadFiles(path);
    } catch (e) {
      notifications.show({ title: "Hata", message: parseApiError(e), color: "red" });
    } finally {
      setRenaming(false);
    }
  }

  function downloadItem(item: FileEntry) {
    window.open(`/api/files/download?path=${encodeURIComponent(item.path)}`, "_blank");
  }

  function bulkDownload() {
    const paths = [...selected];
    if (!paths.length) return;
    window.open(downloadZipUrl(paths), "_blank");
  }

  function startRename(item: FileEntry) {
    setRenameTarget(item);
    setRenameValue(item.name);
  }

  function handleContextMenu(e: React.MouseEvent, item: FileEntry) {
    e.preventDefault();
    setContextMenu({ item, x: e.clientX, y: e.clientY });
  }

  function itemHandlers(item: FileEntry) {
    return {
      selected: selected.has(item.path),
      onSelect: (checked: boolean) => toggleSelect(item.path, checked),
      onOpen: () => (item.is_dir ? openFolder(item.path) : downloadItem(item)),
      onDownload: item.is_dir ? undefined : () => downloadItem(item),
      onPreview: item.is_dir ? undefined : () => setPreviewItem(item),
      onRename: () => startRename(item),
      onDelete: () => setDeleteTarget(item),
      onDetails: () => setDetailItem(item),
      onShare: canShare(item) ? () => setShareTarget(item.path) : undefined,
      onShareLink: canShare(item) ? () => setShareLinkTarget(item.path) : undefined,
      onCopy: () => setFileClipboard({ mode: "copy", paths: [item.path] }),
      onCut: () => setFileClipboard({ mode: "cut", paths: [item.path] }),
      onFavorite: () =>
        toggleFavorite(item.path, item.name).then((r) =>
          notifications.show({ message: r.favorited ? "Favorilere eklendi" : "Favorilerden kaldırıldı", color: "green" })
        ),
      onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, item),
    };
  }

  const crumbs = useMemo(() => {
    if (!homePath) return path === "/" ? [] : path.split("/").filter(Boolean);
    if (path === homePath) return [];
    if (path.startsWith(homePath + "/")) {
      return path.slice(homePath.length + 1).split("/").filter(Boolean);
    }
    return path.split("/").filter(Boolean);
  }, [path, homePath]);

  const crumbPaths = useMemo(() => {
    if (!homePath) {
      return crumbs.map((_, i) => `/${crumbs.slice(0, i + 1).join("/")}`);
    }
    return crumbs.map((_, i) => `${homePath}/${crumbs.slice(0, i + 1).join("/")}`);
  }, [crumbs, homePath]);

  if (loading && files.length === 0 && path === "/") {
    return (
      <Center h="100vh">
        <Stack align="center">
          <Loader size="lg" />
          <Text c="dimmed">Yükleniyor...</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <AppShell navbar={{ width: 280, breakpoint: "sm", collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Navbar p={0}>
        <AppSidebar
          diskName={diskName}
          user={user}
          activePage="files"
          onLogout={logout}
          onOpenPath={openFolder}
        />
      </AppShell.Navbar>

      <AppShell.Main style={{ backgroundColor: colorScheme === "dark" ? "#141517" : "#f8f9fa", minHeight: "100vh", position: "relative" }}>
        <LoadingOverlay visible={loading && files.length > 0} zIndex={100} overlayProps={{ radius: "sm", blur: 1 }} />

        <Group hiddenFrom="sm" mb="md">
          <Burger opened={opened} onClick={toggle} size="sm" />
          <Text fw={700}>{diskName}</Text>
        </Group>

        <Group align="flex-start" gap="md" wrap="nowrap">
          <Stack gap="lg" style={{ flex: 1, minWidth: 0 }}>
            {listError && (
              <Alert color="red" title="Dosyalar yüklenemedi" radius="md" variant="light">
                <Text size="sm" mb="sm">{listError}</Text>
                {user?.role === "admin" && (
                  <Button component="a" href="/admin/settings" size="xs" variant="light" color="red">
                    SMB Ayarlarını Düzenle
                  </Button>
                )}
              </Alert>
            )}

            {usage && usage.quota_bytes && (
              <Text size="xs" c="dimmed">
                Kullanım: {formatSize(usage.used_bytes)} / {formatSize(usage.quota_bytes)}
              </Text>
            )}

            {fileClipboard && fileClipboard.paths.length > 0 && (
              <Alert color="blue" variant="light" radius="md">
                <Group justify="space-between">
                  <Text size="sm">
                    {fileClipboard.paths.length} öğe panoda ({fileClipboard.mode === "copy" ? "kopya" : "kes"})
                  </Text>
                  <Button size="xs" variant="light" onClick={pasteFiles}>
                    Yapıştır (Ctrl+V)
                  </Button>
                </Group>
              </Alert>
            )}

            {globalResults && (
              <Alert color="grape" variant="light" radius="md">
                <Group justify="space-between">
                  <Text size="sm">Global arama: {globalResults.length} sonuç</Text>
                  <Button size="xs" variant="subtle" onClick={() => setGlobalResults(null)}>
                    Aramayı Kapat
                  </Button>
                </Group>
              </Alert>
            )}

            {selected.size > 0 && (
              <Alert color="brand" variant="light" radius="md">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>{selected.size} öğe seçildi</Text>
                  <Group gap="xs">
                    <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={bulkDownload}>
                      ZIP İndir
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => {
                        setFileClipboard({ mode: "copy", paths: [...selected] });
                        notifications.show({ message: "Kopyalandı", color: "blue" });
                      }}
                    >
                      Kopyala
                    </Button>
                    <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={14} />} onClick={() => setBulkDeleteOpen(true)}>
                      Çöpe Taşı
                    </Button>
                    <Button size="xs" variant="subtle" onClick={() => setSelected(new Set())}>
                      Seçimi Kaldır
                    </Button>
                  </Group>
                </Group>
              </Alert>
            )}

            <Group justify="space-between" wrap="wrap">
              <Breadcrumbs separator={<IconChevronRight size={14} />}>
                <Anchor onClick={goHome} style={{ cursor: "pointer" }} c={path === homePath ? "brand" : undefined}>
                  <Group gap={4}>
                    <IconHome size={16} />
                    <Text size="sm">Depolamam</Text>
                  </Group>
                </Anchor>
                {crumbs.map((part, i) => (
                  <Anchor key={crumbPaths[i]} onClick={() => openFolder(crumbPaths[i])} style={{ cursor: "pointer" }} c={path === crumbPaths[i] ? "brand" : undefined}>
                    <Text size="sm">{part}</Text>
                  </Anchor>
                ))}
              </Breadcrumbs>

              <Group>
                <Button leftSection={<IconRefresh size={16} />} variant="subtle" size="sm" onClick={() => loadFiles(path)} loading={loading}>
                  Yenile
                </Button>
                <Button leftSection={<IconFolderPlus size={16} />} variant="light" size="sm" onClick={() => setFolderModal(true)}>
                  Yeni Klasör
                </Button>
                <Button variant="light" size="sm" onClick={goUp} disabled={!homePath || path === homePath}>
                  Üst Klasör
                </Button>
                <SegmentedControl
                  value={viewMode}
                  onChange={(v) => setViewMode(v as "grid" | "list")}
                  data={[
                    { value: "grid", label: <IconLayoutGrid size={16} /> },
                    { value: "list", label: <IconList size={16} /> },
                  ]}
                />
              </Group>
            </Group>

            <Group>
              <TextInput
                placeholder="Ara (Enter: tüm dosyalar)..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (!e.target.value.trim()) setGlobalResults(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runGlobalSearch();
                }}
                style={{ flex: 1, maxWidth: 320 }}
                rightSection={globalSearching ? <Loader size={16} /> : null}
              />
              <Select
                value={`${sortKey}_${sortDir}`}
                onChange={(v) => {
                  if (!v) return;
                  const [k, d] = v.split("_") as [SortKey, SortDir];
                  setSortKey(k);
                  setSortDir(d);
                }}
                data={[
                  { value: "name_asc", label: "Ad (A-Z)" },
                  { value: "name_desc", label: "Ad (Z-A)" },
                  { value: "size_asc", label: "Boyut (küçük)" },
                  { value: "size_desc", label: "Boyut (büyük)" },
                  { value: "date_desc", label: "Tarih (yeni)" },
                  { value: "date_asc", label: "Tarih (eski)" },
                ]}
                w={160}
              />
            </Group>

            {uploading && uploadFileName && (
              <Stack gap={4}>
                <Text size="sm">Yükleniyor: {uploadFileName}</Text>
                <Progress value={uploadProgress} animated />
              </Stack>
            )}

            <Dropzone onDrop={handleUpload} loading={uploading} radius="md" style={{ borderStyle: "dashed" }}>
              <Group justify="center" gap="xl" mih={80} style={{ pointerEvents: "none" }}>
                <Dropzone.Accept><IconUpload size={40} color="var(--mantine-color-brand-6)" stroke={1.5} /></Dropzone.Accept>
                <Dropzone.Reject><IconX size={40} color="var(--mantine-color-red-6)" stroke={1.5} /></Dropzone.Reject>
                <Dropzone.Idle><IconCloudUpload size={40} color="var(--mantine-color-dimmed)" stroke={1.5} /></Dropzone.Idle>
                <div>
                  <Text size="lg" fw={500} inline>Dosyaları buraya bırakın</Text>
                  <Text size="sm" c="dimmed" inline mt={7} ml={4}>veya tıklayarak seçin</Text>
                </div>
              </Group>
            </Dropzone>

            <ScrollArea h="calc(100vh - 360px)" type="auto">
              {displayFiles.length === 0 ? (
                <Center h={200}>
                  <Stack align="center" gap="xs">
                    <IconCloudUpload size={48} color="var(--mantine-color-gray-4)" />
                    <Text c="dimmed">{search ? "Sonuç bulunamadı" : "Bu klasör boş"}</Text>
                  </Stack>
                </Center>
              ) : viewMode === "grid" ? (
                <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
                  {displayFiles.map((item) => (
                    <DriveFileCard key={item.path} item={item} {...itemHandlers(item)} />
                  ))}
                </SimpleGrid>
              ) : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={40}></Table.Th>
                      <Table.Th>Ad</Table.Th>
                      <Table.Th>Boyut</Table.Th>
                      <Table.Th>Tarih</Table.Th>
                      <Table.Th style={{ width: 48 }}></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {displayFiles.map((item) => (
                      <DriveFileRow key={item.path} item={item} {...itemHandlers(item)} />
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </ScrollArea>
          </Stack>

          {detailItem && <FileDetailPanel item={detailItem} onClose={() => setDetailItem(null)} />}
        </Group>

        {contextMenu && (
          <FileContextMenu
            item={contextMenu.item}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={() => setContextMenu(null)}
            onOpen={() => (contextMenu.item.is_dir ? openFolder(contextMenu.item.path) : downloadItem(contextMenu.item))}
            onDownload={contextMenu.item.is_dir ? undefined : () => downloadItem(contextMenu.item)}
            onPreview={contextMenu.item.is_dir ? undefined : () => setPreviewItem(contextMenu.item)}
            onRename={() => startRename(contextMenu.item)}
            onDelete={() => setDeleteTarget(contextMenu.item)}
            onDetails={() => setDetailItem(contextMenu.item)}
            onShare={canShare(contextMenu.item) ? () => setShareTarget(contextMenu.item.path) : undefined}
            onShareLink={canShare(contextMenu.item) ? () => setShareLinkTarget(contextMenu.item.path) : undefined}
            onCopy={() => setFileClipboard({ mode: "copy", paths: [contextMenu.item.path] })}
            onCut={() => setFileClipboard({ mode: "cut", paths: [contextMenu.item.path] })}
            onFavorite={() =>
              toggleFavorite(contextMenu.item.path, contextMenu.item.name).then((r) =>
                notifications.show({ message: r.favorited ? "Favorilere eklendi" : "Favorilerden kaldırıldı", color: "green" })
              )
            }
          />
        )}

        <ShareModal path={shareTarget} onClose={() => setShareTarget(null)} onShared={() => notifications.show({ title: "Paylaşıldı", message: "Dosya paylaşımı oluşturuldu", color: "green" })} />
        <ShareLinkModal path={shareLinkTarget} opened={!!shareLinkTarget} onClose={() => setShareLinkTarget(null)} />

        <FilePreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />

        <Modal opened={folderModal} onClose={() => setFolderModal(false)} title="Yeni Klasör Oluştur" centered radius="lg">
          <Stack>
            <TextInput label="Klasör Adı" placeholder="Klasör adı girin" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createFolder()} data-autofocus />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setFolderModal(false)}>İptal</Button>
              <Button onClick={createFolder}>Oluştur</Button>
            </Group>
          </Stack>
        </Modal>

        <Modal opened={!!renameTarget} onClose={() => setRenameTarget(null)} title="Yeniden Adlandır" centered radius="lg">
          <Stack>
            <TextInput label="Yeni Ad" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmRename()} data-autofocus />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRenameTarget(null)}>İptal</Button>
              <Button onClick={confirmRename} loading={renaming}>Kaydet</Button>
            </Group>
          </Stack>
        </Modal>

        <DeleteConfirmModal item={deleteTarget} loading={deleting} onClose={() => !deleting && setDeleteTarget(null)} onConfirm={confirmDelete} />

        <Modal opened={bulkDeleteOpen} onClose={() => !deleting && setBulkDeleteOpen(false)} title="Toplu Sil" centered radius="lg">
          <Stack>
            <Text size="sm">{selected.size} öğe kalıcı olarak silinecek. Emin misiniz?</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setBulkDeleteOpen(false)} disabled={deleting}>İptal</Button>
              <Button color="red" onClick={confirmBulkDelete} loading={deleting}>Sil</Button>
            </Group>
          </Stack>
        </Modal>
      </AppShell.Main>
    </AppShell>
  );
}
