"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Paper,
  SimpleGrid,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { DriveShell } from "@/components/DriveShell";
import { User, api } from "@/lib/api";

interface HealthData {
  status: string;
  uptime_seconds: number;
  database: { ok: boolean; error: string | null };
  storage: { ok: boolean; error: string | null; info: Record<string, unknown> };
  storage_mode: string;
  mount_path: string;
}

interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  path: string;
  detail: string;
  created_at: string;
}

export default function AdminHealthPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [diskName, setDiskName] = useState("Depolama");
  const [health, setHealth] = useState<HealthData | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    Promise.all([
      api<User>("/auth/me"),
      api<{ disk_display_name: string }>("/public/disk-name"),
      api<HealthData>("/admin/health-dashboard"),
      api<AuditLog[]>("/admin/audit-logs?limit=30"),
    ])
      .then(([me, disk, h, audit]) => {
        if (me.role !== "admin") {
          router.replace("/");
          return;
        }
        setUser(me);
        setDiskName(disk.disk_display_name);
        setHealth(h);
        setLogs(audit);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  function formatUptime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h} sa ${m} dk`;
  }

  return (
    <DriveShell diskName={diskName} user={user} activePage="health" onLogout={logout}>
        <Title order={2} mb="lg">Sistem Sağlığı</Title>

        {health && (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} mb="xl">
            <Paper p="lg" withBorder radius="lg">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Genel Durum</Text>
              <Badge size="lg" mt="sm" color={health.status === "healthy" ? "green" : "yellow"}>{health.status}</Badge>
              <Text size="sm" c="dimmed" mt="sm">Uptime: {formatUptime(health.uptime_seconds)}</Text>
            </Paper>
            <Paper p="lg" withBorder radius="lg">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>PostgreSQL</Text>
              <Badge size="lg" mt="sm" color={health.database.ok ? "green" : "red"}>{health.database.ok ? "Bağlı" : "Hata"}</Badge>
              {health.database.error && <Text size="xs" c="red" mt="sm">{health.database.error}</Text>}
            </Paper>
            <Paper p="lg" withBorder radius="lg">
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Depolama ({health.storage_mode})</Text>
              <Badge size="lg" mt="sm" color={health.storage.ok ? "green" : "red"}>{health.storage.ok ? "Erişilebilir" : "Hata"}</Badge>
              <Text size="xs" c="dimmed" mt="sm">Mount: {health.mount_path}</Text>
              {health.storage.error && <Text size="xs" c="red" mt="xs">{health.storage.error}</Text>}
            </Paper>
          </SimpleGrid>
        )}

        <Paper withBorder radius="lg" p="lg">
          <Title order={4} mb="md">Son İşlemler (Audit Log)</Title>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Tarih</Table.Th>
                <Table.Th>Kullanıcı</Table.Th>
                <Table.Th>İşlem</Table.Th>
                <Table.Th>Yol</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {logs.length === 0 ? (
                <Table.Tr><Table.Td colSpan={4}><Text c="dimmed" ta="center">Henüz kayıt yok</Text></Table.Td></Table.Tr>
              ) : (
                logs.map((log) => (
                  <Table.Tr key={log.id}>
                    <Table.Td><Text size="sm">{new Date(log.created_at).toLocaleString("tr-TR")}</Text></Table.Td>
                    <Table.Td><Text size="sm">{log.user_email || "—"}</Text></Table.Td>
                    <Table.Td><Badge variant="light">{log.action}</Badge></Table.Td>
                    <Table.Td><Text size="sm" lineClamp={1}>{log.path}</Text></Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Paper>
    </DriveShell>
  );
}
