"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { DriveShell } from "@/components/DriveShell";
import { User, api } from "@/lib/api";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [diskName, setDiskName] = useState("Depolama");
  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ color: "green" | "red"; message: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api<User>("/auth/me"),
      api<{ disk_display_name: string }>("/public/disk-name"),
    ])
      .then(([me, disk]) => {
        setUser(me);
        setDiskName(disk.disk_display_name);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (newPass !== confirm) {
      setAlert({ color: "red", message: "Yeni şifreler eşleşmiyor" });
      return;
    }
    setLoading(true);
    setAlert(null);
    try {
      await api("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ current_password: current, new_password: newPass }),
      });
      setAlert({ color: "green", message: "Şifre güncellendi" });
      setCurrent("");
      setNewPass("");
      setConfirm("");
    } catch (err) {
      setAlert({ color: "red", message: err instanceof Error ? err.message : "Hata" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <DriveShell diskName={diskName} user={user} activePage="profile" onLogout={logout}>
        <Title order={2} mb="lg">Profil</Title>
        <Paper p="lg" radius="lg" withBorder maw={480} component="form" onSubmit={changePassword}>
          <Stack>
            <Text size="sm" c="dimmed">Hesap: {user?.email}</Text>
            <PasswordInput label="Mevcut Şifre" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            <PasswordInput label="Yeni Şifre" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={6} />
            <PasswordInput label="Yeni Şifre (Tekrar)" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <Button type="submit" loading={loading}>Şifreyi Güncelle</Button>
          </Stack>
        </Paper>
        {alert && (
          <Box mt="md" maw={480}>
            <Alert color={alert.color}>{alert.message}</Alert>
          </Box>
        )}
    </DriveShell>
  );
}
