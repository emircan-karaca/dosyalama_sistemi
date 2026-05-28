"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, Center, Group, Loader, Paper, Stack, Text, TextInput, Title } from "@mantine/core";

interface PublicEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export default function PublicSharePage() {
  const params = useParams();
  const token = params.token as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [data, setData] = useState<{ path: string; is_dir: boolean; name?: string; size?: number; entries?: PublicEntry[] } | null>(null);

  async function load(pwd?: string) {
    setLoading(true);
    setError("");
    try {
      const q = pwd ? `?password=${encodeURIComponent(pwd)}` : "";
      const res = await fetch(`/api/public/share/${token}${q}`, { credentials: "include" });
      if (res.status === 401) {
        setNeedsPassword(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || "Link geçersiz");
      }
      setData(await res.json());
      setNeedsPassword(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  function download(path?: string) {
    const q = new URLSearchParams();
    if (password) q.set("password", password);
    if (path) q.set("path", path);
    window.open(`/api/public/share/${token}/download?${q.toString()}`, "_blank");
  }

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (needsPassword) {
    return (
      <Center h="100vh">
        <Paper withBorder p="xl" radius="lg" w={360}>
          <Stack>
            <Title order={4}>Şifre gerekli</Title>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Paylaşım şifresi" />
            <Button onClick={() => load(password)}>Devam</Button>
          </Stack>
        </Paper>
      </Center>
    );
  }

  if (error) {
    return (
      <Center h="100vh">
        <Text c="red">{error}</Text>
      </Center>
    );
  }

  if (!data) return null;

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" radius="lg" maw={600} w="100%">
        <Title order={3} mb="md">
          Paylaşılan {data.is_dir ? "Klasör" : "Dosya"}
        </Title>
        {data.is_dir && data.entries ? (
          <Stack gap="xs">
            {data.entries.map((e) => (
              <Group key={e.path} justify="space-between">
                <Text size="sm">{e.name}</Text>
                {!e.is_dir && (
                  <Button size="xs" variant="light" onClick={() => download(e.path)}>
                    İndir
                  </Button>
                )}
              </Group>
            ))}
          </Stack>
        ) : (
          <Group>
            <Text>{data.name}</Text>
            <Button onClick={() => download()}>İndir</Button>
          </Group>
        )}
      </Paper>
    </Center>
  );
}
