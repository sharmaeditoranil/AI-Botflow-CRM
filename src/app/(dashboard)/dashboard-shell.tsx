"use client";

import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { BrowserNotificationsListener } from "@/components/notifications/browser-notifications-listener";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { cn } from "@/lib/utils";

interface DashboardShellContextValue {
  openSidebar: () => void;
  closeSidebar: () => void;
  sidebarOpen: boolean;
}

const DashboardShellContext = createContext<DashboardShellContextValue>({
  openSidebar: () => {},
  closeSidebar: () => {},
  sidebarOpen: false,
});

export const useDashboardShell = () => useContext(DashboardShellContext);

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isInbox = pathname?.startsWith("/inbox");
  const t = useTranslations("DashboardShell");

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardShellContext.Provider value={{ openSidebar, closeSidebar, sidebarOpen }}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Reports this tab's online/away presence once we know a user is
            signed in. Headless — renders nothing. */}
        <PresenceHeartbeat />
        {/* Desktop alerts for new customer messages (opt-in via Settings →
            Your profile). Headless — renders nothing. */}
        <BrowserNotificationsListener />
        <Sidebar open={sidebarOpen} onClose={closeSidebar} />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Header onOpenSidebar={openSidebar} />
          {/* Inbox manages its own split-pane layouts; standard pages get padding & vertical scroll. */}
          <main
            className={cn(
              "flex-1 min-w-0 min-h-0",
              isInbox
                ? "overflow-hidden p-0"
                : "overflow-y-auto overscroll-y-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch] p-4 sm:p-6 pb-24 lg:pb-6"
            )}
          >
            {/* Above every page: writes are being rejected and here's why.
                Renders nothing unless the account/role failed to resolve. */}
            <AccountAccessAlert />
            {children}
          </main>
          {/* Render mobile bottom nav for non-inbox pages */}
          {!isInbox && <MobileBottomNav onOpenMenu={openSidebar} />}
        </div>
      </div>
    </DashboardShellContext.Provider>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
