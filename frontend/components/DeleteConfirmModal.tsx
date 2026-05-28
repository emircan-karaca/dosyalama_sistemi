"use client";

import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { FileEntry } from "@/lib/api";

interface DeleteConfirmModalProps {
  item: FileEntry | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({ item, loading, onClose, onConfirm }: DeleteConfirmModalProps) {
  return (
    <Modal opened={!!item} onClose={onClose} title="Silme Onayı" centered radius="lg">
      {item && (
        <Stack>
          <Group align="flex-start" gap="sm">
            <IconAlertTriangle size={22} color="var(--mantine-color-red-6)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <Text fw={600} mb={4}>
                &quot;{item.name}&quot; silinsin mi?
              </Text>
              {item.is_dir ? (
                <Text size="sm" c="dimmed">
                  Klasör çöp kutusuna taşınır. 30 gün içinde geri yüklenebilir.
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  Dosya çöp kutusuna taşınır. 30 gün içinde geri yüklenebilir.
                </Text>
              )}
              <Text size="xs" c="dimmed" mt="sm">
                İpucu: Finder veya Windows Gezgini&apos;nde bu klasör açıksa önce bağlantıyı kapatın.
              </Text>
            </div>
          </Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={loading}>
              İptal
            </Button>
            <Button color="red" onClick={onConfirm} loading={loading}>
              Çöpe Taşı
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
