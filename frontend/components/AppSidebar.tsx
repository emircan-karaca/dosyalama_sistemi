"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  NavLink,
  Stack,
  Text,
  ThemeIcon,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconBell,
  IconCloud,
  IconHeartRateMonitor,
  IconHome,
  IconLogout,
  IconMoon,
  IconSettings,
  IconShare,
  IconStar,
  IconSun,
  IconTrash,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { Bookmark, User, getUnreadCount, listBookmarks } from "@/lib/api";

export type SidebarPage =
  | "files"
  | "settings"
  | "users"
  | "health"
  | "profile"
  | "shared"
  | "trash"
  | "notifications";

interface AppSidebarProps {
  diskName: string;
  user: User | null;
  activePage: SidebarPage;
  onLogout: () => void;
  onOpenPath?: (path: string) => void;
}

function SidebarLink({
  href,
  label,
  icon,
  active,
  color,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  color?: string;
  badge?: number;
}) {
  const router = useRouter();

  return (
    <NavLink
      label={
        badge ? (
          <Group justify="space-between" wrap="nowrap">
            <span>{label}</span>
            <Badge size="xs" circle color="red">
              {badge}
            </Badge>
          </Group>
        ) : (
          label
        )
      }
      leftSection={icon}
      active={active}
      variant="light"
      autoContrast
      color={color}
      href={href}
      onClick={(e) => {
        e.preventDefault();
        router.push(href);
      }}
      style={{ cursor: "pointer" }}
    />
  );
}

export function AppSidebar({ diskName, user, activePage, onLogout, onOpenPath }: AppSidebarProps) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const router = useRouter();
  const border = colorScheme === "dark" ? "#373a40" : "#e9ecef";
  const bg = colorScheme === "dark" ? "#25262b" : "#f8f9fa";
  const [unread, setUnread] = useState(0);
  const [favorites, setFavorites] = useState<Bookmark[]>([]);
  const [recent, setRecent] = useState<Bookmark[]>([]);

  useEffect(() => {
    if (!user) return;
    getUnreadCount().then((r) => setUnread(r.count)).catch(() => {});
    listBookmarks("favorite").then(setFavorites).catch(() => {});
    listBookmarks("recent").then(setRecent).catch(() => {});
  }, [user, activePage]);

  return (
    <Stack h="100%" p="md" justify="space-between" style={{ borderRight: `1px solid ${border}`, backgroundColor: bg }}>
      <Box>
        <Group mb="xl" px="xs">
          <ThemeIcon size={40} radius="lg" variant="gradient" gradient={{ from: "brand.5", to: "brand.8", deg: 135 }}>
            <IconCloud size={24} />
          </ThemeIcon>
          <div>
            <Text fw={700} size="lg" style={{ lineHeight: 1.2 }}>
              {diskName}
            </Text>
            <Text size="xs" c="dimmed">
              Cloud Storage
            </Text>
          </div>
        </Group>

        <Stack gap="xs">
          <SidebarLink href="/" label="Dosyalarım" icon={<IconHome size={20} stroke={1.5} />} active={activePage === "files"} />
          <SidebarLink href="/shared" label="Paylaşımlar" icon={<IconShare size={20} stroke={1.5} />} active={activePage === "shared"} />
          <SidebarLink href="/trash" label="Çöp Kutusu" icon={<IconTrash size={20} stroke={1.5} />} active={activePage === "trash"} />
          <SidebarLink
            href="/notifications"
            label="Bildirimler"
            icon={<IconBell size={20} stroke={1.5} />}
            active={activePage === "notifications"}
            badge={unread > 0 ? unread : undefined}
          />
          <SidebarLink href="/profile" label="Profil" icon={<IconUser size={20} stroke={1.5} />} active={activePage === "profile"} />

          {(favorites.length > 0 || recent.length > 0) && (
            <>
              <Text size="xs" fw={500} c="dimmed" mt="md" px="xs">
                HIZLI ERİŞİM
              </Text>
              {favorites.slice(0, 5).map((b) => (
                <NavLink
                  key={b.id}
                  label={b.label}
                  leftSection={<IconStar size={16} />}
                  variant="subtle"
                  onClick={() => (onOpenPath ? onOpenPath(b.path) : router.push(`/?path=${encodeURIComponent(b.path)}`))}
                  style={{ cursor: "pointer" }}
                />
              ))}
              {recent.slice(0, 5).map((b) => (
                <NavLink
                  key={b.id}
                  label={b.label}
                  variant="subtle"
                  onClick={() => (onOpenPath ? onOpenPath(b.path) : router.push(`/?path=${encodeURIComponent(b.path)}`))}
                  style={{ cursor: "pointer" }}
                />
              ))}
            </>
          )}

          {user?.role === "admin" && (
            <>
              <Text size="xs" fw={500} c="dimmed" mt="md" px="xs">
                YÖNETİM
              </Text>
              <SidebarLink href="/admin/settings" label="Ayarlar" icon={<IconSettings size={20} stroke={1.5} />} active={activePage === "settings"} color="brand" />
              <SidebarLink href="/admin/users" label="Kullanıcılar" icon={<IconUsers size={20} stroke={1.5} />} active={activePage === "users"} color="brand" />
              <SidebarLink href="/admin/health" label="Sağlık" icon={<IconHeartRateMonitor size={20} stroke={1.5} />} active={activePage === "health"} color="brand" />
            </>
          )}
        </Stack>
      </Box>

      <Box>
        <Group
          justify="space-between"
          align="center"
          style={{ borderTop: `1px solid ${colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}` }}
          pt="md"
        >
          <Group gap="xs">
            <ThemeIcon variant="light" radius="xl" size="md">
              <Text size="xs" fw={700}>
                {(user?.email?.[0] || "?").toUpperCase()}
              </Text>
            </ThemeIcon>
            <Box style={{ maxWidth: 140, overflow: "hidden" }}>
              <Text size="sm" fw={500} truncate>
                {user?.email}
              </Text>
            </Box>
          </Group>
          <Group gap={4}>
            <ActionIcon variant="subtle" color="gray" onClick={() => toggleColorScheme()} title="Tema">
              {colorScheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
            <ActionIcon variant="subtle" color="red" onClick={onLogout} title="Çıkış">
              <IconLogout size={18} />
            </ActionIcon>
          </Group>
        </Group>
      </Box>
    </Stack>
  );
}
