"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Container,
  Divider,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import { IconAlertCircle, IconCloud, IconLock, IconMail, IconMoon, IconSun } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      notifications.show({ title: "Giriş Başarılı", message: "Hoş geldiniz!", color: "green" });
      router.replace("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Giriş başarısız";
      setError(msg);
      notifications.show({ title: "Giriş Başarısız", message: msg, color: "red" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          colorScheme === "dark"
            ? "linear-gradient(135deg, #1a1b1e 0%, #141517 50%, #0d0e10 100%)"
            : "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #6B8DD6 100%)",
        position: "relative",
      }}
    >
      <Tooltip label={colorScheme === "dark" ? "Açık Mod" : "Koyu Mod"}>
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={() => toggleColorScheme()}
          style={{ position: "absolute", top: 20, right: 20, color: "white" }}
        >
          {colorScheme === "dark" ? <IconSun size={20} /> : <IconMoon size={20} />}
        </ActionIcon>
      </Tooltip>

      <Container size={440}>
        <Stack align="center" mb="xl">
          <ThemeIcon
            size={80}
            radius="xl"
            variant="gradient"
            gradient={{ from: "brand.4", to: "brand.7", deg: 135 }}
            style={{ boxShadow: "0 8px 32px rgba(61, 102, 255, 0.4)" }}
          >
            <IconCloud size={40} />
          </ThemeIcon>
          <Title order={1} ta="center" c="white">
            Dosyalama
          </Title>
          <Text c="white" size="lg" ta="center" style={{ opacity: 0.9 }}>
            Kendi sunucunuzda bulut depolama
          </Text>
        </Stack>

        <Paper withBorder shadow="xl" p={32} radius="lg">
          <form onSubmit={onSubmit}>
            {error && (
              <Alert color="red" mb="lg" icon={<IconAlertCircle size={18} />} radius="md">
                {error}
              </Alert>
            )}
            <TextInput
              label="Email"
              placeholder="email@ornek.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              mb="md"
              leftSection={<IconMail size={18} />}
            />
            <PasswordInput
              label="Şifre"
              placeholder="Şifrenizi girin"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              mb="xl"
              leftSection={<IconLock size={18} />}
            />
            <Button fullWidth type="submit" loading={loading} size="md" radius="xl">
              Giriş Yap
            </Button>
            <Divider label="kurulum" labelPosition="center" my="lg" />
            <Text ta="center" size="sm">
              İlk kurulum mu?{" "}
              <Anchor component="button" type="button" fw={600} onClick={() => router.push("/setup")}>
                Kurulum Sihirbazı
              </Anchor>
            </Text>
          </form>
        </Paper>
      </Container>
    </Box>
  );
}
