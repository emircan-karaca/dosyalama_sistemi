"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Tabs,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  ACTION_LABELS,
  FileComment,
  FileEntry,
  FileVersion,
  AuditEntry,
  addComment,
  formatSize,
  getFileHistory,
  getFileVersions,
  listComments,
  parseApiError,
  restoreVersion,
} from "@/lib/api";

interface FileDetailPanelProps {
  item: FileEntry | null;
  onClose: () => void;
}

export function FileDetailPanel({ item, onClose }: FileDetailPanelProps) {
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [comments, setComments] = useState<FileComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingTab, setLoadingTab] = useState(false);

  useEffect(() => {
    if (!item || item.is_dir) {
      setHistory([]);
      setVersions([]);
      setComments([]);
      return;
    }
    setLoadingTab(true);
    Promise.all([
      getFileHistory(item.path),
      getFileVersions(item.path),
      listComments(item.path),
    ])
      .then(([h, v, c]) => {
        setHistory(h);
        setVersions(v);
        setComments(c);
      })
      .catch(() => {})
      .finally(() => setLoadingTab(false));
  }, [item]);

  if (!item) return null;

  async function submitComment() {
    if (!item || !commentText.trim()) return;
    try {
      const c = await addComment(item.path, commentText.trim());
      setComments((prev) => [...prev, c]);
      setCommentText("");
    } catch (e) {
      notifications.show({ title: "Hata", message: parseApiError(e), color: "red" });
    }
  }

  async function handleRestoreVersion(id: string) {
    try {
      await restoreVersion(id);
      notifications.show({ title: "Başarılı", message: "Sürüm geri yüklendi", color: "green" });
    } catch (e) {
      notifications.show({ title: "Hata", message: parseApiError(e), color: "red" });
    }
  }

  return (
    <Paper
      w={300}
      p="md"
      radius="md"
      withBorder
      style={{ flexShrink: 0, alignSelf: "flex-start", position: "sticky", top: 16, maxHeight: "calc(100vh - 80px)", overflow: "auto" }}
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={5}>Detaylar</Title>
          <Text size="xs" c="dimmed" style={{ cursor: "pointer" }} onClick={onClose}>
            Kapat
          </Text>
        </Group>
        <Text fw={700} size="sm" lineClamp={3}>
          {item.name}
        </Text>
        <DetailRow label="Tür" value={item.is_dir ? "Klasör" : "Dosya"} />
        <DetailRow label="Boyut" value={item.is_dir ? "—" : formatSize(item.size)} />
        <DetailRow
          label="Değiştirilme"
          value={item.modified ? new Date(item.modified).toLocaleString("tr-TR") : "—"}
        />
        <DetailRow label="Yol" value={item.path} />

        {!item.is_dir && (
          <Tabs defaultValue="history">
            <Tabs.List>
              <Tabs.Tab value="history">Geçmiş</Tabs.Tab>
              <Tabs.Tab value="versions">Sürümler</Tabs.Tab>
              <Tabs.Tab value="comments">Yorumlar</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="history" pt="sm">
              {loadingTab ? (
                <Loader size="sm" />
              ) : history.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Geçmiş kaydı yok
                </Text>
              ) : (
                <Stack gap="xs">
                  {history.map((h) => (
                    <Box key={h.id}>
                      <Text size="xs" fw={600}>
                        {h.user_email} — {ACTION_LABELS[h.action] || h.action}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {new Date(h.created_at).toLocaleString("tr-TR")}
                      </Text>
                    </Box>
                  ))}
                </Stack>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="versions" pt="sm">
              {versions.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Sürüm yok
                </Text>
              ) : (
                <Stack gap="xs">
                  {versions.map((v) => (
                    <Group key={v.id} justify="space-between" wrap="nowrap">
                      <Box>
                        <Text size="xs">{new Date(v.created_at).toLocaleString("tr-TR")}</Text>
                        <Text size="xs" c="dimmed">
                          {formatSize(v.size)}
                        </Text>
                      </Box>
                      <Button size="compact-xs" variant="light" onClick={() => handleRestoreVersion(v.id)}>
                        Geri yükle
                      </Button>
                    </Group>
                  ))}
                </Stack>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="comments" pt="sm">
              <Stack gap="xs">
                {comments.map((c) => (
                  <Box key={c.id}>
                    <Group gap={4}>
                      <Text size="xs" fw={600}>
                        {c.user_email}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {new Date(c.created_at).toLocaleString("tr-TR")}
                      </Text>
                    </Group>
                    <Text size="sm">{c.body}</Text>
                  </Box>
                ))}
                <Textarea
                  placeholder="Yorum yaz..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  minRows={2}
                  size="xs"
                />
                <Button size="xs" onClick={submitComment} disabled={!commentText.trim()}>
                  Gönder
                </Button>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        )}
      </Stack>
    </Paper>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text size="sm" style={{ wordBreak: "break-all" }}>
        {value}
      </Text>
    </Box>
  );
}
