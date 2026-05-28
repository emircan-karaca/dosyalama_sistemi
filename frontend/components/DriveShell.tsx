"use client";

import { AppShell, Burger, Group, Text, useMantineColorScheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { AppSidebar, SidebarPage } from "@/components/AppSidebar";
import { User } from "@/lib/api";

interface DriveShellProps {
  diskName: string;
  user: User | null;
  activePage: SidebarPage;
  onLogout: () => void;
  onOpenPath?: (path: string) => void;
  children: React.ReactNode;
}

export function DriveShell({ diskName, user, activePage, onLogout, onOpenPath, children }: DriveShellProps) {
  const { colorScheme } = useMantineColorScheme();
  const [opened, { toggle }] = useDisclosure();

  return (
    <AppShell
      navbar={{
        width: 280,
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Navbar p={0}>
        <AppSidebar diskName={diskName} user={user} activePage={activePage} onLogout={onLogout} onOpenPath={onOpenPath} />
      </AppShell.Navbar>

      <AppShell.Main
        style={{
          backgroundColor: colorScheme === "dark" ? "#141517" : "#f8f9fa",
          minHeight: "100vh",
          position: "relative",
        }}
      >
        <Group hiddenFrom="sm" mb="md">
          <Burger opened={opened} onClick={toggle} size="sm" aria-label="Menüyü aç" />
          <Text fw={700}>{diskName}</Text>
        </Group>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
