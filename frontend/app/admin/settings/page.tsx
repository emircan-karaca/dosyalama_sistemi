"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DriveShell } from "@/components/DriveShell";
import { User, api } from "@/lib/api";

export default function AdminSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [diskName, setDiskName] = useState("Depolama");
  const [loading, setLoading] = useState(true);
  const [testingDb, setTestingDb] = useState(false);
  const [testingSmb, setTestingSmb] = useState(false);
  const [savingSmb, setSavingSmb] = useState(false);
  const [savingDb, setSavingDb] = useState(false);
  const [alert, setAlert] = useState<{ color: "green" | "red" | "blue" | "yellow"; title: string; message: string } | null>(null);

  const [smb, setSmb] = useState({
    smb_host: "",
    smb_share: "",
    smb_username: "",
    smb_password: "",
    smb_root_path: "/",
    storage_mode: "smb",
  });
  const [db, setDb] = useState({ host: "", port: "5432", database: "", username: "", password: "" });

  useEffect(() => {
    Promise.all([
      api<{ disk_display_name: string; smb_host: string; smb_share: string; smb_username: string; smb_root_path: string; storage_mode: string }>("/admin/settings"),
      api<{ host: string; port: number; database: string; username: string }>("/admin/database"),
      api<User>("/auth/me"),
      api<{ disk_display_name: string }>("/public/disk-name"),
    ])
      .then(([settings, database, me, disk]) => {
        if (me.role !== "admin") {
          router.replace("/");
          return;
        }
        setUser(me);
        setDiskName(disk.disk_display_name);
        setSmb({
          smb_host: settings.smb_host,
          smb_share: settings.smb_share,
          smb_username: settings.smb_username,
          smb_password: "",
          smb_root_path: settings.smb_root_path,
          storage_mode: settings.storage_mode || "smb",
        });
        setDb({
          host: database.host,
          port: String(database.port),
          database: database.database,
          username: database.username,
          password: "",
        });
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function testSmb() {
    setTestingSmb(true);
    setAlert({ color: "blue", title: "Test ediliyor...", message: "SMB paylaşımına bağlanılıyor." });
    try {
      await api("/admin/test-smb", {
        method: "POST",
        body: JSON.stringify({
          disk_display_name: diskName,
          smb_host: smb.smb_host,
          smb_share: smb.smb_share,
          smb_username: smb.smb_username,
          smb_password: smb.smb_password || undefined,
          smb_root_path: smb.smb_root_path,
          storage_mode: smb.storage_mode,
        }),
      });
      setAlert({ color: "green", title: "SMB çalışıyor!", message: "Paylaşıma erişim başarılı." });
    } catch (e) {
      setAlert({ color: "red", title: "SMB başarısız", message: e instanceof Error ? e.message : "Hata" });
    } finally {
      setTestingSmb(false);
    }
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setSavingSmb(true);
    try {
      await api("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ disk_display_name: diskName, ...smb, smb_password: smb.smb_password || undefined }),
      });
      setAlert({ color: "green", title: "Kaydedildi", message: "SMB ayarları güncellendi." });
    } catch (e) {
      setAlert({ color: "red", title: "Hata", message: e instanceof Error ? e.message : "Kaydedilemedi" });
    } finally {
      setSavingSmb(false);
    }
  }

  async function testDb() {
    if (!db.password) {
      setAlert({ color: "red", title: "Şifre gerekli", message: "Test için PostgreSQL şifresini girin." });
      return;
    }
    setTestingDb(true);
    setAlert({ color: "blue", title: "Test ediliyor...", message: "PostgreSQL sunucusuna bağlanılıyor." });
    try {
      await api("/admin/test-db", { method: "POST", body: JSON.stringify({ ...db, port: Number(db.port) }) });
      setAlert({ color: "green", title: "PostgreSQL çalışıyor!", message: "Bağlantı başarılı." });
    } catch (e) {
      setAlert({ color: "red", title: "PostgreSQL başarısız", message: e instanceof Error ? e.message : "Hata" });
    } finally {
      setTestingDb(false);
    }
  }

  async function saveDatabase(e: FormEvent) {
    e.preventDefault();
    if (!db.password) {
      setAlert({ color: "red", title: "Şifre gerekli", message: "Güncellemek için şifre girin." });
      return;
    }
    setSavingDb(true);
    try {
      await api("/admin/database", { method: "PATCH", body: JSON.stringify({ ...db, port: Number(db.port) }) });
      setAlert({ color: "green", title: "Kaydedildi", message: "PostgreSQL ayarları güncellendi." });
    } catch (e) {
      setAlert({ color: "red", title: "Hata", message: e instanceof Error ? e.message : "Kaydedilemedi" });
    } finally {
      setSavingDb(false);
    }
  }

  async function resetSmb() {
    setAlert({ color: "blue", title: "Sıfırlanıyor...", message: "SMB bağlantı önbelleği temizleniyor." });
    try {
      const res = await api<{ message: string }>("/admin/reset-smb", { method: "POST" });
      setAlert({ color: "green", title: "Tamam", message: res.message });
    } catch (e) {
      setAlert({ color: "red", title: "Hata", message: e instanceof Error ? e.message : "Başarısız" });
    }
  }

  async function diagnoseSmb() {
    setAlert({ color: "blue", title: "Teşhis...", message: "SMB yolları kontrol ediliyor." });
    try {
      const res = await api<{
        share_ok: boolean;
        configured_root_ok: boolean;
        share_path: string;
        root_path: string;
        share_entries: string[];
        hint: string;
        share_error?: string;
        root_error?: string;
      }>("/admin/smb-diagnose");
      const lines = [
        res.share_ok ? "✓ Paylaşım açılıyor" : `✗ Paylaşım hatası: ${res.share_error || "?"}`,
        res.configured_root_ok ? "✓ Kök klasör açılıyor" : `✗ Kök klasör hatası: ${res.root_error || "?"}`,
        res.share_entries.length ? `Paylaşımdaki öğeler: ${res.share_entries.join(", ")}` : "",
        res.hint,
      ].filter(Boolean);
      setAlert({
        color: res.configured_root_ok ? "green" : "yellow",
        title: "SMB Teşhis",
        message: lines.join("\n"),
      });
    } catch (e) {
      setAlert({ color: "red", title: "Teşhis başarısız", message: e instanceof Error ? e.message : "Hata" });
    }
  }

  async function fixRoot() {
    setAlert({ color: "blue", title: "Düzeltiliyor...", message: "Kök klasör '/' yapılıyor." });
    try {
      const res = await api<{ message: string }>("/admin/fix-smb-root", { method: "POST" });
      setSmb((s) => ({ ...s, smb_root_path: "/" }));
      setAlert({ color: "green", title: "Düzeltildi", message: res.message });
    } catch (e) {
      setAlert({ color: "red", title: "Hata", message: e instanceof Error ? e.message : "Başarısız" });
    }
  }

  if (loading) {
    return (
      <Center h="100vh">
        <Text c="dimmed">Yükleniyor...</Text>
      </Center>
    );
  }

  return (
    <DriveShell diskName={diskName} user={user} activePage="settings" onLogout={logout}>
        <Title order={2} mb="lg">
          Sistem Ayarları
        </Title>

        <Paper component="form" onSubmit={saveSettings} p="lg" radius="lg" mb="lg" withBorder>
          <Title order={4} mb="md">
            Disk & SMB
          </Title>
          <Stack>
            <TextInput label="Disk Adı" value={diskName} onChange={(e) => setDiskName(e.target.value)} />
            <Select
              label="Depolama Modu"
              description="mount: CIFS mount (/mnt/smb). smb: doğrudan SMB protokolü."
              value={smb.storage_mode}
              onChange={(v) => setSmb({ ...smb, storage_mode: v || "smb" })}
              data={[
                { value: "smb", label: "SMB Protokolü (varsayılan)" },
                { value: "mount", label: "CIFS Mount" },
              ]}
            />
            <TextInput label="SMB Sunucu" value={smb.smb_host} onChange={(e) => setSmb({ ...smb, smb_host: e.target.value })} disabled={smb.storage_mode === "mount"} />
            <TextInput label="Paylaşım" value={smb.smb_share} onChange={(e) => setSmb({ ...smb, smb_share: e.target.value })} />
            <TextInput label="Kullanıcı" value={smb.smb_username} onChange={(e) => setSmb({ ...smb, smb_username: e.target.value })} />
            <PasswordInput label="Şifre (değiştirmek için)" value={smb.smb_password} onChange={(e) => setSmb({ ...smb, smb_password: e.target.value })} />
            <TextInput label="Kök Klasör" description="Genelde '/' — paylaşımın tamamına erişir. 'docs' klasörüne arayüzden girin." placeholder="/" value={smb.smb_root_path} onChange={(e) => setSmb({ ...smb, smb_root_path: e.target.value })} />
            <Group wrap="wrap">
              <Button variant="light" type="button" onClick={testSmb} loading={testingSmb}>
                Bağlantıyı Test Et
              </Button>
              <Button variant="light" type="button" color="orange" onClick={diagnoseSmb}>
                SMB Teşhis
              </Button>
              <Button variant="light" type="button" color="grape" onClick={resetSmb}>
                Bağlantıyı Sıfırla
              </Button>
              <Button variant="light" type="button" color="teal" onClick={fixRoot}>
                Kök Klasörü / Yap
              </Button>
              <Button type="submit" loading={savingSmb}>
                SMB Kaydet
              </Button>
            </Group>
          </Stack>
        </Paper>

        <Paper component="form" onSubmit={saveDatabase} p="lg" radius="lg" withBorder>
          <Title order={4} mb="md">
            PostgreSQL
          </Title>
          <Stack>
            <TextInput label="Sunucu" value={db.host} onChange={(e) => setDb({ ...db, host: e.target.value })} />
            <TextInput label="Port" value={db.port} onChange={(e) => setDb({ ...db, port: e.target.value })} />
            <TextInput label="Veritabanı" value={db.database} onChange={(e) => setDb({ ...db, database: e.target.value })} />
            <TextInput label="Kullanıcı" value={db.username} onChange={(e) => setDb({ ...db, username: e.target.value })} />
            <PasswordInput label="Şifre" value={db.password} onChange={(e) => setDb({ ...db, password: e.target.value })} />
            <Group>
              <Button variant="light" type="button" onClick={testDb} loading={testingDb}>
                Bağlantıyı Test Et
              </Button>
              <Button type="submit" loading={savingDb}>
                PostgreSQL Kaydet
              </Button>
            </Group>
          </Stack>
        </Paper>

        {alert && (
          <Box mt="md">
            <Alert color={alert.color} title={alert.title} variant="light" radius="md">
              <Text size="sm" style={{ whiteSpace: "pre-line" }}>
                {alert.message}
              </Text>
            </Alert>
          </Box>
        )}
    </DriveShell>
  );
}
