"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Stepper,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconCheck, IconCloud, IconDatabase, IconServer, IconUser } from "@tabler/icons-react";
import { api, getSetupStatus } from "@/lib/api";

type Step = "needs_db" | "needs_smb" | "needs_admin";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("needs_db");
  const [active, setActive] = useState(0);
  const [testingDb, setTestingDb] = useState(false);
  const [testingSmb, setTestingSmb] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dbAlert, setDbAlert] = useState<{ color: "green" | "red" | "blue"; title: string; message: string } | null>(null);
  const [smbAlert, setSmbAlert] = useState<{ color: "green" | "red" | "blue"; title: string; message: string } | null>(null);

  const [db, setDb] = useState({ host: "", port: "5432", database: "", username: "", password: "" });
  const [smb, setSmb] = useState({
    disk_display_name: "Ana Disk",
    smb_host: "",
    smb_share: "",
    smb_username: "",
    smb_password: "",
    smb_root_path: "/",
  });
  const [admin, setAdmin] = useState({ email: "", password: "" });

  useEffect(() => {
    getSetupStatus().then((s) => {
      if (s.ready) router.replace("/login");
      else if (s.step !== "ready") {
        setStep(s.step as Step);
        setActive(s.step === "needs_db" ? 0 : s.step === "needs_smb" ? 1 : 2);
      }
    });
  }, [router]);

  async function testDb() {
    setTestingDb(true);
    setDbAlert({ color: "blue", title: "Test ediliyor...", message: "PostgreSQL sunucusuna bağlanılıyor." });
    try {
      const res = await api<{ message?: string }>("/setup/test-db", {
        method: "POST",
        body: JSON.stringify({ ...db, port: Number(db.port) }),
      });
      setDbAlert({
        color: "green",
        title: "PostgreSQL çalışıyor!",
        message: res.message || "Bağlantı başarılı. Kaydet ile devam edebilirsiniz.",
      });
    } catch (e) {
      setDbAlert({
        color: "red",
        title: "Bağlantı başarısız",
        message: e instanceof Error ? e.message : "PostgreSQL'e ulaşılamadı.",
      });
    } finally {
      setTestingDb(false);
    }
  }

  async function saveDb() {
    setSaving(true);
    try {
      await api("/setup/save-db", { method: "POST", body: JSON.stringify({ ...db, port: Number(db.port) }) });
      setStep("needs_smb");
      setActive(1);
      setDbAlert(null);
    } catch (e) {
      setDbAlert({ color: "red", title: "Kayıt başarısız", message: e instanceof Error ? e.message : "Hata" });
    } finally {
      setSaving(false);
    }
  }

  async function testSmb() {
    setTestingSmb(true);
    setSmbAlert({ color: "blue", title: "Test ediliyor...", message: "SMB paylaşımına bağlanılıyor." });
    try {
      const res = await api<{ message?: string }>("/setup/test-smb", { method: "POST", body: JSON.stringify(smb) });
      setSmbAlert({
        color: "green",
        title: "SMB çalışıyor!",
        message: res.message || "Paylaşıma erişim başarılı.",
      });
    } catch (e) {
      setSmbAlert({
        color: "red",
        title: "SMB bağlantısı başarısız",
        message: e instanceof Error ? e.message : "Paylaşıma ulaşılamadı.",
      });
    } finally {
      setTestingSmb(false);
    }
  }

  async function saveSmb() {
    setSaving(true);
    try {
      await api("/setup/save-smb", { method: "POST", body: JSON.stringify(smb) });
      setStep("needs_admin");
      setActive(2);
      setSmbAlert(null);
    } catch (e) {
      setSmbAlert({ color: "red", title: "Kayıt başarısız", message: e instanceof Error ? e.message : "Hata" });
    } finally {
      setSaving(false);
    }
  }

  async function createAdmin() {
    setSaving(true);
    try {
      await api("/setup/create-admin", { method: "POST", body: JSON.stringify(admin) });
      router.replace("/login");
    } catch (e) {
      setSmbAlert({ color: "red", title: "Admin oluşturulamadı", message: e instanceof Error ? e.message : "Hata" });
      setActive(2);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box mih="100vh" bg="gray.0" py="xl">
      <Container size="sm">
        <Stack align="center" mb="xl">
          <ThemeIcon size={60} radius="xl" variant="gradient" gradient={{ from: "brand.4", to: "brand.7", deg: 135 }}>
            <IconCloud size={32} />
          </ThemeIcon>
          <Title order={2}>Kurulum Sihirbazı</Title>
          <Text c="dimmed" ta="center">
            PostgreSQL, SMB ve admin hesabını yapılandırın
          </Text>
        </Stack>

        <Paper withBorder shadow="sm" p="xl" radius="lg">
          <Stepper active={active} mb="xl" color="brand">
            <Stepper.Step label="PostgreSQL" description="Veritabanı" icon={<IconDatabase size={18} />} />
            <Stepper.Step label="SMB" description="Disk & paylaşım" icon={<IconServer size={18} />} />
            <Stepper.Step label="Admin" description="Hesap" icon={<IconUser size={18} />} />
          </Stepper>

          {step === "needs_db" && (
            <Stack>
              <TextInput label="Sunucu" placeholder="192.168.1.100" value={db.host} onChange={(e) => { setDb({ ...db, host: e.target.value }); setDbAlert(null); }} />
              <TextInput label="Port" value={db.port} onChange={(e) => { setDb({ ...db, port: e.target.value }); setDbAlert(null); }} />
              <TextInput label="Veritabanı" placeholder="dosyalama" value={db.database} onChange={(e) => { setDb({ ...db, database: e.target.value }); setDbAlert(null); }} />
              <TextInput label="Kullanıcı" value={db.username} onChange={(e) => { setDb({ ...db, username: e.target.value }); setDbAlert(null); }} />
              <PasswordInput label="Şifre" value={db.password} onChange={(e) => { setDb({ ...db, password: e.target.value }); setDbAlert(null); }} />
              {dbAlert && (
                <Alert color={dbAlert.color} title={dbAlert.title} radius="md" variant="light">
                  {dbAlert.message}
                </Alert>
              )}
              <Group>
                <Button variant="light" onClick={testDb} loading={testingDb}>Bağlantıyı Test Et</Button>
                <Button onClick={saveDb} loading={saving} leftSection={<IconCheck size={16} />}>Kaydet ve Devam</Button>
              </Group>
            </Stack>
          )}

          {step === "needs_smb" && (
            <Stack>
              <TextInput label="Disk Adı" value={smb.disk_display_name} onChange={(e) => setSmb({ ...smb, disk_display_name: e.target.value })} />
              <TextInput label="SMB Sunucu" placeholder="10.0.0.2" value={smb.smb_host} onChange={(e) => { setSmb({ ...smb, smb_host: e.target.value }); setSmbAlert(null); }} />
              <TextInput label="Paylaşım Adı" placeholder="Y" value={smb.smb_share} onChange={(e) => { setSmb({ ...smb, smb_share: e.target.value }); setSmbAlert(null); }} />
              <TextInput label="SMB Kullanıcı" placeholder="Administrator" value={smb.smb_username} onChange={(e) => { setSmb({ ...smb, smb_username: e.target.value }); setSmbAlert(null); }} />
              <PasswordInput label="SMB Şifre" value={smb.smb_password} onChange={(e) => { setSmb({ ...smb, smb_password: e.target.value }); setSmbAlert(null); }} />
              <TextInput label="Kök Klasör" description="Paylaşım kökü için '/' kullanın. Alt klasör için örn. /docs" placeholder="/" value={smb.smb_root_path} onChange={(e) => { setSmb({ ...smb, smb_root_path: e.target.value }); setSmbAlert(null); }} />
              {smbAlert && (
                <Alert color={smbAlert.color} title={smbAlert.title} radius="md" variant="light">
                  {smbAlert.message}
                </Alert>
              )}
              <Group>
                <Button variant="light" onClick={testSmb} loading={testingSmb}>Bağlantıyı Test Et</Button>
                <Button onClick={saveSmb} loading={saving} leftSection={<IconCheck size={16} />}>Kaydet ve Devam</Button>
              </Group>
            </Stack>
          )}

          {step === "needs_admin" && (
            <Stack>
              <TextInput label="Email" type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
              <PasswordInput label="Şifre" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} />
              <Button onClick={createAdmin} loading={saving} leftSection={<IconCheck size={16} />}>
                Kurulumu Tamamla
              </Button>
            </Stack>
          )}
        </Paper>
      </Container>
    </Box>
  );
}
