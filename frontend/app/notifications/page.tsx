"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { DriveShell } from "@/components/DriveShell";
import {
  Me,
  NotificationItem,
  api,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";

export default function NotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [diskName, setDiskName] = useState("Depolama");
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    Promise.all([
      api<Me>("/auth/me"),
      api<{ disk_display_name: string }>("/public/disk-name"),
      listNotifications(),
    ])
      .then(([me, disk, notes]) => {
        setUser(me);
        setDiskName(disk.disk_display_name);
        setItems(notes);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function markRead(id: string) {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function markAll() {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <DriveShell diskName={diskName} user={user} activePage="notifications" onLogout={logout}>
      <Group justify="space-between" mb="lg">
        <Title order={2}>Bildirimler</Title>
        <Button variant="light" size="sm" onClick={markAll}>
          Tümünü okundu işaretle
        </Button>
      </Group>

      <Stack gap="sm">
        {items.length === 0 ? (
          <Paper withBorder p="lg" radius="lg">
            <Text c="dimmed">Bildirim yok</Text>
          </Paper>
        ) : (
          items.map((n) => (
            <Paper
              key={n.id}
              withBorder
              p="md"
              radius="lg"
              style={{ opacity: n.read ? 0.7 : 1, cursor: "pointer" }}
              onClick={() => !n.read && markRead(n.id)}
            >
              <Group justify="space-between" mb={4}>
                <Text fw={600}>{n.title}</Text>
                {!n.read && (
                  <Badge size="xs" color="brand">
                    Yeni
                  </Badge>
                )}
              </Group>
              <Text size="sm">{n.body}</Text>
              <Text size="xs" c="dimmed" mt="xs">
                {new Date(n.created_at).toLocaleString("tr-TR")}
              </Text>
            </Paper>
          ))
        )}
      </Stack>
    </DriveShell>
  );
}
