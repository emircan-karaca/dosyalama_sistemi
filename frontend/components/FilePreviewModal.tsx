"use client";

import { Box, Modal, Text } from "@mantine/core";
import { FileEntry, previewUrl } from "@/lib/api";

interface FilePreviewModalProps {
  item: FileEntry | null;
  onClose: () => void;
}

export function FilePreviewModal({ item, onClose }: FilePreviewModalProps) {
  if (!item) return null;

  const ext = item.name.includes(".") ? item.name.split(".").pop()?.toLowerCase() : "";
  const url = previewUrl(item.path);
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
  const isPdf = ext === "pdf";
  const isText = ["txt", "md", "json", "csv"].includes(ext || "");

  return (
    <Modal opened={!!item} onClose={onClose} title={item.name} size="xl" centered radius="lg">
      {isImage && (
        <Box ta="center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={item.name} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }} />
        </Box>
      )}
      {isPdf && (
        <iframe src={url} title={item.name} style={{ width: "100%", height: "70vh", border: "none" }} />
      )}
      {isText && (
        <Text size="sm" c="dimmed" mb="xs">
          Metin önizleme (max 1MB)
        </Text>
      )}
      {isText && (
        <iframe src={url} title={item.name} style={{ width: "100%", height: "60vh", border: "1px solid #dee2e6" }} />
      )}
      {!isImage && !isPdf && !isText && (
        <Text c="dimmed">Bu dosya türü önizlenemez.</Text>
      )}
    </Modal>
  );
}
