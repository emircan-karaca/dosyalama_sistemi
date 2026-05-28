"use client";

import { useState } from "react";
import { Button, CopyButton, Group, Modal, NumberInput, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { createShareLink, parseApiError } from "@/lib/api";

interface ShareLinkModalProps {
  path: string | null;
  opened: boolean;
  onClose: () => void;
}

export function ShareLinkModal({ path, opened, onClose }: ShareLinkModalProps) {
  const [expiresHours, setExpiresHours] = useState<number | string>(168);
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!path) return;
    setLoading(true);
    try {
      const link = await createShareLink(path, Number(expiresHours) || 168, password || undefined);
      const full = `${window.location.origin}/share/${link.token}`;
      setUrl(full);
      notifications.show({ title: "Link oluşturuldu", message: "Paylaşım linki hazır", color: "green" });
    } catch (e) {
      notifications.show({ title: "Hata", message: parseApiError(e), color: "red" });
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setUrl("");
    setPassword("");
    onClose();
  }

  return (
    <Modal opened={opened} onClose={handleClose} title="Link ile Paylaş" centered>
      <Stack>
        <Text size="sm" c="dimmed" lineClamp={2}>
          {path}
        </Text>
        {!url ? (
          <>
            <NumberInput label="Geçerlilik (saat)" value={expiresHours} onChange={setExpiresHours} min={1} max={8760} />
            <TextInput label="Şifre (opsiyonel)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button onClick={handleCreate} loading={loading}>
              Link Oluştur
            </Button>
          </>
        ) : (
          <>
            <TextInput label="Paylaşım linki" value={url} readOnly />
            <Group>
              <CopyButton value={url}>
                {({ copied, copy }) => (
                  <Button variant="light" onClick={copy}>
                    {copied ? "Kopyalandı" : "Kopyala"}
                  </Button>
                )}
              </CopyButton>
              <Button variant="subtle" onClick={handleClose}>
                Kapat
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
