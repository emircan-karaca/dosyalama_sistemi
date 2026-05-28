"use client";

import { ActionIcon, Checkbox, Group, Menu, Table, Text, ThemeIcon } from "@mantine/core";
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

interface DriveFileRowProps {
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

export function DriveFileRow({ item, selected, onSelect, onOpen, onDownload, onPreview, onRename, onDelete, onDetails, onShare, onContextMenu }: DriveFileRowProps) {
  return (
    <Table.Tr
      style={{
        cursor: "pointer",
        backgroundColor: selected ? "var(--mantine-color-brand-light)" : undefined,
      }}
      onClick={onOpen}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <Table.Td w={40} onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onChange={(e) => onSelect(e.currentTarget.checked)} aria-label={`Seç: ${item.name}`} />
      </Table.Td>
      <Table.Td>
        <Group gap="sm">
          <ThemeIcon size={32} radius="md" variant="light" color={item.is_dir ? "yellow" : "blue"}>
            {item.is_dir ? <IconFolderFilled size={18} /> : <IconFile size={18} />}
          </ThemeIcon>
          <Text size="sm" fw={500}>
            {item.name}
          </Text>
        </Group>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {item.is_dir ? "—" : formatSize(item.size)}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {item.modified ? new Date(item.modified).toLocaleString("tr-TR") : "—"}
        </Text>
      </Table.Td>
      <Table.Td onClick={(e) => e.stopPropagation()}>
        <Group gap={4} justify="flex-end">
          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray">
                <IconDotsVertical size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {!item.is_dir && onDownload && (
                <Menu.Item leftSection={<IconDownload size={14} />} onClick={onDownload}>
                  İndir
                </Menu.Item>
              )}
              {!item.is_dir && isPreviewable(item.name) && onPreview && (
                <Menu.Item leftSection={<IconEye size={14} />} onClick={onPreview}>
                  Önizle
                </Menu.Item>
              )}
              {onShare && <Menu.Item leftSection={<IconShare size={14} />} onClick={onShare}>Paylaş</Menu.Item>}
              {onDetails && <Menu.Item onClick={onDetails}>Detaylar</Menu.Item>}
              {onRename && (
                <Menu.Item leftSection={<IconPencil size={14} />} onClick={onRename}>
                  Yeniden Adlandır
                </Menu.Item>
              )}
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={onDelete}>
                Sil
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}
