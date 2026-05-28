"use client";

import { useEffect, useState } from "react";
import { Modal, Select, Stack, Text, Button, Group } from "@mantine/core";
import { User, createShare, listUsersForShare } from "@/lib/api";

interface ShareModalProps {
  path: string | null;
  onClose: () => void;
  onShared: () => void;
}

export function ShareModal({ path, onClose, onShared }: ShareModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [permission, setPermission] = useState<string>("read");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    listUsersForShare()
      .then(setUsers)
      .catch(() => setError("Kullanıcı listesi yüklenemedi"));
  }, [path]);

  async function submit() {
    if (!path || !userId) return;
    setLoading(true);
    setError(null);
    try {
      await createShare(path, userId, permission as "read" | "write");
      onShared();
      onClose();
      setUserId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paylaşım başarısız");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal opened={!!path} onClose={onClose} title="Dosyayı Paylaş" centered radius="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Paylaşılacak: <strong>{path?.split("/").pop()}</strong>
        </Text>
        <Select
          label="Kullanıcı"
          placeholder="Kullanıcı seçin"
          data={users.map((u) => ({ value: u.id, label: `${u.email} (${u.role})` }))}
          value={userId}
          onChange={setUserId}
          searchable
        />
        <Select
          label="İzin"
          value={permission}
          onChange={(v) => setPermission(v || "read")}
          data={[
            { value: "read", label: "Sadece okuma" },
            { value: "write", label: "Okuma + yazma" },
          ]}
        />
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            İptal
          </Button>
          <Button onClick={submit} loading={loading} disabled={!userId}>
            Paylaş
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
