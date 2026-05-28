"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconRestore, IconTrash } from "@tabler/icons-react";
import { DriveShell } from "@/components/DriveShell";
import {
  Me,
  TrashItem,
  api,
  formatSize,
  listTrash,
  parseApiError,
  purgeTrashItem,
  restoreTrashItem,
} from "@/lib/api";

export default function TrashPage() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [diskName, setDiskName] = useState("Depolama");
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setItems(await listTrash());
    } catch (e) {
      notifications.show({ title: "Hata", message: parseApiError(e), color: "red" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([api<Me>("/auth/me"), api<{ disk_display_name: string }>("/public/disk-name")])
      .then(([me, disk]) => {
        setUser(me);
        setDiskName(disk.disk_display_name);
        return load();
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function restore(id: string) {
    try {
      const res = await restoreTrashItem(id);
      notifications.show({ title: "Geri yüklendi", message: res.path, color: "green" });
      await load();
    } catch (e) {
      notifications.show({ title: "Hata", message: parseApiError(e), color: "red" });
    }
  }

  async function purge(id: string, name: string) {
    if (!confirm(`"${name}" kalıcı olarak silinsin mi?`)) return;
    try {
      await purgeTrashItem(id);
      notifications.show({ title: "Silindi", message: name, color: "green" });
      await load();
    } catch (e) {
      notifications.show({ title: "Hata", message: parseApiError(e), color: "red" });
    }
  }

  return (
    <DriveShell diskName={diskName} user={user} activePage="trash" onLogout={logout}>
      <Title order={2} mb="lg">
        Çöp Kutusu
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Silinen dosyalar 30 gün sonra otomatik temizlenir.
      </Text>

      <Paper withBorder radius="lg" p="lg">
        {loading ? (
          <Text c="dimmed">Yükleniyor...</Text>
        ) : items.length === 0 ? (
          <Text c="dimmed">Çöp kutusu boş</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Ad</Table.Th>
                <Table.Th>Boyut</Table.Th>
                <Table.Th>Silinme</Table.Th>
                <Table.Th>Bitiş</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>
                        {item.name}
                      </Text>
                      {item.is_dir && (
                        <Badge size="xs" variant="light">
                          Klasör
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {item.original_path}
                    </Text>
                  </Table.Td>
                  <Table.Td>{item.is_dir ? "—" : formatSize(item.size)}</Table.Td>
                  <Table.Td>{new Date(item.deleted_at).toLocaleString("tr-TR")}</Table.Td>
                  <Table.Td>{new Date(item.expires_at).toLocaleDateString("tr-TR")}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button size="xs" variant="light" leftSection={<IconRestore size={14} />} onClick={() => restore(item.id)}>
                        Geri Yükle
                      </Button>
                      <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={14} />} onClick={() => purge(item.id, item.name)}>
                        Kalıcı Sil
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </DriveShell>
  );
}
