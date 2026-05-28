"use client";

import { ActionIcon, Card, Checkbox, Group, Menu, Text, ThemeIcon } from "@mantine/core";
import {
  IconDotsVertical,
  IconDownload,
  IconEye,
  IconFile,
  IconFolderFilled,
  IconPencil,
  IconShare,
  IconTrash,
} from "@tabler/icons-react";
import { FileEntry, formatSize, isPreviewable } from "@/lib/api";

interface DriveFileCardProps {
  item: FileEntry;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onOpen: () => void;
  onDownload?: () => void;
  onPreview?: () => void;
  onRename?: () => void;
  onDelete: () => void;
  onDetails?: () => void;
  onShare?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function DriveFileCard({ item, selected, onSelect, onOpen, onDownload, onPreview, onRename, onDelete, onDetails, onShare, onContextMenu }: DriveFileCardProps) {
  const isFolder = item.is_dir;

  return (
    <Card
      padding="md"
      radius="md"
      withBorder
      className="file-card"
      style={{
        cursor: "pointer",
        outline: selected ? "2px solid var(--mantine-color-brand-6)" : undefined,
      }}
      onClick={onOpen}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onContextMenu={onContextMenu}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Checkbox
            checked={selected}
            onChange={(e) => onSelect(e.currentTarget.checked)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Seç: ${item.name}`}
          />
          <ThemeIcon size={36} radius="md" variant="light" color={isFolder ? "yellow" : "blue"}>
            {isFolder ? <IconFolderFilled size={20} /> : <IconFile size={20} />}
          </ThemeIcon>
        </Group>
        <Menu shadow="md" width={200} position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={(e) => e.stopPropagation()}>
              <IconDotsVertical size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {!isFolder && onDownload && (
              <Menu.Item leftSection={<IconDownload size={14} />} onClick={(e) => { e.stopPropagation(); onDownload(); }}>
                İndir
              </Menu.Item>
            )}
            {!isFolder && isPreviewable(item.name) && onPreview && (
              <Menu.Item leftSection={<IconEye size={14} />} onClick={(e) => { e.stopPropagation(); onPreview(); }}>
                Önizle
              </Menu.Item>
            )}
            {onShare && (
              <Menu.Item leftSection={<IconShare size={14} />} onClick={(e) => { e.stopPropagation(); onShare(); }}>
                Paylaş
              </Menu.Item>
            )}
            {onDetails && (
              <Menu.Item onClick={(e) => { e.stopPropagation(); onDetails(); }}>Detaylar</Menu.Item>
            )}
            {onRename && (
              <Menu.Item leftSection={<IconPencil size={14} />} onClick={(e) => { e.stopPropagation(); onRename(); }}>
                Yeniden Adlandır
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              Sil
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Text fw={600} size="sm" lineClamp={2} mb="xs">
        {item.name}
      </Text>
      <Text size="xs" c="dimmed">
        {isFolder
          ? item.modified
            ? new Date(item.modified).toLocaleDateString("tr-TR")
            : "Klasör"
          : formatSize(item.size)}
      </Text>
    </Card>
  );
}
