"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DriveShell } from "@/components/DriveShell";
import { Me, UserStorageInfo, api } from "@/lib/api";

interface AdminUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
  home_path?: string | null;
  is_provisioned?: boolean | null;
  is_storage_active?: boolean | null;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [diskName, setDiskName] = useState("Depolama");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ color: "green" | "red"; message: string } | null>(null);
  const [editUser, setEditUser] = useState<UserStorageInfo | null>(null);
  const [quota, setQuota] = useState<number | string>("");
  const [active, setActive] = useState(true);

  async function loadUsers() {
    const data = await api<AdminUser[]>("/admin/users");
    setUsers(data);
  }

  useEffect(() => {
    Promise.all([api<Me>("/auth/me"), api<{ disk_display_name: string }>("/public/disk-name")])
      .then(async ([me, disk]) => {
        if (me.role !== "admin") {
          router.replace("/");
          return;
        }
        setUser(me);
        setDiskName(disk.disk_display_name);
        await loadUsers();
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAlert(null);
    try {
      await api("/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, password, role }),
      });
      setModalOpen(false);
      setEmail("");
      setPassword("");
      setRole("user");
      await loadUsers();
      setAlert({ color: "green", message: "Kullanıcı ve depolama alanı oluşturuldu" });
    } catch (err) {
      setAlert({ color: "red", message: err instanceof Error ? err.message : "Hata" });
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(id: string) {
    if (!confirm("Bu kullanıcı silinsin mi?")) return;
    try {
      await api(`/admin/users/${id}`, { method: "DELETE" });
      await loadUsers();
      setAlert({ color: "green", message: "Kullanıcı silindi" });
    } catch (err) {
      setAlert({ color: "red", message: err instanceof Error ? err.message : "Hata" });
    }
  }

  async function provisionUser(id: string) {
    try {
      await api(`/admin/user-storage/${id}/provision`, { method: "POST" });
      await loadUsers();
      setAlert({ color: "green", message: "Depolama klasörü oluşturuldu" });
    } catch (err) {
      setAlert({ color: "red", message: err instanceof Error ? err.message : "Hata" });
    }
  }

  async function provisionAll() {
    try {
      const res = await api<{ provisioned: number }>("/admin/user-storage/provision-all", { method: "POST" });
      await loadUsers();
      setAlert({ color: "green", message: `${res.provisioned} kullanıcı depolaması hazırlandı` });
    } catch (err) {
      setAlert({ color: "red", message: err instanceof Error ? err.message : "Hata" });
    }
  }

  async function openEdit(u: AdminUser) {
    const list = await api<UserStorageInfo[]>("/admin/user-storage");
    const row = list.find((s) => s.user_id === u.id);
    if (row) {
      setEditUser(row);
      setQuota(row.quota_bytes ?? "");
      setActive(row.is_active);
    }
  }

  async function saveStorage() {
    if (!editUser) return;
    try {
      await api(`/admin/user-storage/${editUser.user_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          quota_bytes: quota === "" ? null : Number(quota),
          is_active: active,
        }),
      });
      setEditUser(null);
      await loadUsers();
      setAlert({ color: "green", message: "Depolama ayarları güncellendi" });
    } catch (err) {
      setAlert({ color: "red", message: err instanceof Error ? err.message : "Hata" });
    }
  }

  return (
    <DriveShell diskName={diskName} user={user} activePage="users" onLogout={logout}>
      <Group justify="space-between" mb="lg">
        <Title order={2}>Kullanıcılar & Depolama</Title>
        <Group>
          <Button variant="light" onClick={provisionAll}>
            Tüm Depolamaları Oluştur
          </Button>
          <Button onClick={() => setModalOpen(true)}>Yeni Kullanıcı</Button>
        </Group>
      </Group>

      {alert && (
        <Box mb="md">
          <Alert color={alert.color} onClose={() => setAlert(null)} withCloseButton>
            {alert.message}
          </Alert>
        </Box>
      )}

      <Paper withBorder radius="lg" p="md">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Rol</Table.Th>
              <Table.Th>Depolama Yolu</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>İşlemler</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>{u.email}</Table.Td>
                <Table.Td>
                  <Badge color={u.role === "admin" ? "brand" : "gray"}>{u.role}</Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {u.home_path || "—"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Badge color={u.is_provisioned ? "green" : "yellow"} variant="light">
                      {u.is_provisioned ? "Hazır" : "Bekliyor"}
                    </Badge>
                    {u.is_storage_active === false && (
                      <Badge color="red" variant="light">
                        Pasif
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {!u.is_provisioned && (
                      <Button size="xs" variant="light" onClick={() => provisionUser(u.id)}>
                        Oluştur
                      </Button>
                    )}
                    <Button size="xs" variant="light" onClick={() => openEdit(u)}>
                      Ayarla
                    </Button>
                    {u.home_path && (
                      <Button
                        size="xs"
                        variant="light"
                        color="brand"
                        onClick={() => router.push(`/?path=${encodeURIComponent(u.home_path!)}`)}
                      >
                        Dosyalar
                      </Button>
                    )}
                    {u.id !== user?.id && (
                      <Button size="xs" variant="light" color="red" onClick={() => removeUser(u.id)}>
                        Sil
                      </Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Yeni Kullanıcı" centered>
        <form onSubmit={createUser}>
          <Stack>
            <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <PasswordInput label="Şifre" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            <Select
              label="Rol"
              value={role}
              onChange={(v) => setRole(v || "user")}
              data={[
                { value: "user", label: "Kullanıcı" },
                { value: "admin", label: "Admin" },
              ]}
            />
            <Text size="xs" c="dimmed">
              Kullanıcı oluşturulunca otomatik olarak /users/&#123;id&#125; depolama alanı ayrılır.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setModalOpen(false)} type="button">
                İptal
              </Button>
              <Button type="submit" loading={saving}>
                Oluştur
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!editUser} onClose={() => setEditUser(null)} title="Depolama Ayarları" centered>
        {editUser && (
          <Stack>
            <Text size="sm">
              <strong>{editUser.email}</strong>
            </Text>
            <TextInput label="Depolama Yolu" value={editUser.home_path} readOnly />
            <NumberInput
              label="Kota (byte, boş = sınırsız)"
              value={quota}
              onChange={setQuota}
              min={0}
              thousandSeparator=","
            />
            <Switch label="Depolama aktif" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditUser(null)}>
                İptal
              </Button>
              <Button onClick={saveStorage}>Kaydet</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </DriveShell>
  );
}
