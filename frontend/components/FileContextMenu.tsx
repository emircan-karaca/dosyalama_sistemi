"use client";

import { Menu } from "@mantine/core";
import {
  IconClipboard,
  IconClipboardCopy,
  IconDownload,
  IconEye,
  IconInfoCircle,
  IconLink,
  IconPencil,
  IconShare,
  IconStar,
  IconTrash,
} from "@tabler/icons-react";
import { FileEntry, isPreviewable } from "@/lib/api";

interface FileContextMenuProps {
  item: FileEntry;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onOpen: () => void;
  onDownload?: () => void;
  onPreview?: () => void;
  onRename?: () => void;
  onDelete: () => void;
  onDetails?: () => void;
  onShare?: () => void;
  onShareLink?: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onFavorite?: () => void;
}

export function FileContextMenu({
  item,
  position,
  onClose,
  onOpen,
  onDownload,
  onPreview,
  onRename,
  onDelete,
  onDetails,
  onShare,
  onShareLink,
  onCopy,
  onCut,
  onFavorite,
}: FileContextMenuProps) {
  if (!position) return null;

  return (
    <Menu opened onClose={onClose} withinPortal position="bottom-start">
      <Menu.Target>
        <div style={{ position: "fixed", left: position.x, top: position.y, width: 1, height: 1 }} />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => { onOpen(); onClose(); }}>
          {item.is_dir ? "Aç" : "Aç / İndir"}
        </Menu.Item>
        {!item.is_dir && onDownload && (
          <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => { onDownload(); onClose(); }}>
            İndir
          </Menu.Item>
        )}
        {!item.is_dir && isPreviewable(item.name) && onPreview && (
          <Menu.Item leftSection={<IconEye size={14} />} onClick={() => { onPreview(); onClose(); }}>
            Önizle
          </Menu.Item>
        )}
        {onDetails && (
          <Menu.Item leftSection={<IconInfoCircle size={14} />} onClick={() => { onDetails(); onClose(); }}>
            Detaylar
          </Menu.Item>
        )}
        {onShare && (
          <Menu.Item leftSection={<IconShare size={14} />} onClick={() => { onShare(); onClose(); }}>
            Kullanıcıyla Paylaş
          </Menu.Item>
        )}
        {onShareLink && (
          <Menu.Item leftSection={<IconLink size={14} />} onClick={() => { onShareLink(); onClose(); }}>
            Link Oluştur
          </Menu.Item>
        )}
        {onFavorite && (
          <Menu.Item leftSection={<IconStar size={14} />} onClick={() => { onFavorite(); onClose(); }}>
            Favorilere Ekle
          </Menu.Item>
        )}
        {(onCopy || onCut) && <Menu.Divider />}
        {onCopy && (
          <Menu.Item leftSection={<IconClipboardCopy size={14} />} onClick={() => { onCopy(); onClose(); }}>
            Kopyala
          </Menu.Item>
        )}
        {onCut && (
          <Menu.Item leftSection={<IconClipboard size={14} />} onClick={() => { onCut(); onClose(); }}>
            Kes
          </Menu.Item>
        )}
        {onRename && (
          <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => { onRename(); onClose(); }}>
            Yeniden Adlandır
          </Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => { onDelete(); onClose(); }}>
          Sil
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
