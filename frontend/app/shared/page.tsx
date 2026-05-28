"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconFolderOpen, IconShare } from "@tabler/icons-react";
import { DriveShell } from "@/components/DriveShell";
import { Me, ShareEntry, User, api, listMyShares, listSharesWithMe, revokeShare } from "@/lib/api";

export default function SharedPage() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [diskName, setDiskName] = useState("Depolama");
  const [incoming, setIncoming] = useState<ShareEntry[]>([]);
  const [outgoing, setOutgoing] = useState<ShareEntry[]>([]);

  useEffect(() => {
    Promise.all([
      api<Me>("/auth/me"),
      api<{ disk_display_name: string }>("/public/disk-name"),
      listSharesWithMe(),
      listMyShares(),
    ])
      .then(([me, disk, inc, out]) => {
        setUser(me);
        setDiskName(disk.disk_display_name);
        setIncoming(inc);
        setOutgoing(out);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function handleRevoke(id: string) {
    if (!confirm("Paylaşım iptal edilsin mi?")) return;
    await revokeShare(id);
    setOutgoing(await listMyShares());
  }

  function openPath(p: string) {
    router.push(`/?path=${encodeURIComponent(p)}`);
  }

  return (
    <DriveShell diskName={diskName} user={user} activePage="shared" onLogout={logout}>
      <Title order={2} mb="lg">
        Paylaşımlar
      </Title>

      <Paper withBorder radius="lg" p="lg" mb="xl">
        <Group mb="md">
          <IconShare size={20} />
          <Title order={4}>Benimle Paylaşılanlar</Title>
        </Group>
        {incoming.length === 0 ? (
          <Text c="dimmed" size="sm">
            Henüz sizinle paylaşılan dosya yok.
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Sahip</Table.Th>
                <Table.Th>Yol</Table.Th>
                <Table.Th>İzin</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {incoming.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>{s.owner_email}</Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={1}>
                      {s.path}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{s.permission === "write" ? "Yazma" : "Okuma"}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="light" leftSection={<IconFolderOpen size={14} />} onClick={() => openPath(s.path)}>
                      Aç
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Paper withBorder radius="lg" p="lg">
        <Title order={4} mb="md">
          Benim Paylaştıklarım
        </Title>
        {outgoing.length === 0 ? (
          <Text c="dimmed" size="sm">
            Henüz paylaşım yapmadınız. Dosyaya sağ tıklayıp Paylaş seçin.
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Kime</Table.Th>
                <Table.Th>Yol</Table.Th>
                <Table.Th>İzin</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {outgoing.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>{s.shared_with_email}</Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={1}>
                      {s.path}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light">{s.permission === "write" ? "Yazma" : "Okuma"}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button size="xs" variant="light" onClick={() => openPath(s.path)}>
                        Aç
                      </Button>
                      <Button size="xs" variant="light" color="red" onClick={() => handleRevoke(s.id)}>
                        İptal
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
