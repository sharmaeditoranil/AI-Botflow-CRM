"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, Menu, Settings as SettingsIcon, UserCircle, ChevronRight } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { WalletPill } from "@/components/wallet/wallet-pill";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const pageTitles: Record<string, string> = {
  "/dashboard": "dashboard",
  "/inbox": "inbox",
  "/notifications": "notifications",
  "/contacts": "contacts",
  "/pipelines": "pipelines",
  "/broadcasts": "broadcasts",
  "/automations": "automations",
  "/flows": "flows",
  "/agents": "agents",
  "/gmb": "gmb",
  "/profile": "profile",
  "/billing": "billing",
  "/settings": "settings",
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path)
  );
  return match ? match[1] : "dashboard";
}

interface HeaderProps {
  onOpenSidebar?: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const titleKey = getPageTitleKey(pathname);

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    "U";

  const isInbox = pathname?.startsWith("/inbox");

  return (
    <header
      className={cn(
        "h-15 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/80 backdrop-blur-md px-4 lg:px-6 transition-all",
        isInbox ? "hidden lg:flex" : "flex"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Mobile Hamburger */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t("openMenu")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 lg:hidden">
          <BrandLogo size={24} />
        </div>

        {/* Page Title & Breadcrumb */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs font-medium text-muted-foreground/70">
            Aibotflow
          </span>
          <ChevronRight className="hidden sm:inline size-3 text-muted-foreground/40" />
          <h1 className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">
            {t(titleKey as string)}
          </h1>
        </div>

        {/* Live System Status Indicator */}
        <div className="hidden md:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Realtime Active</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Prepaid Wallet Credits Widget */}
        <WalletPill />

        {/* Theme mode toggle */}
        <ModeToggle />

        {/* User profile dropdown trigger */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-xl border border-border/40 p-1 transition-all hover:bg-muted/70 focus:outline-none data-popup-open:bg-muted/70 sm:gap-2.5 sm:px-2"
            aria-label={t("openAccountMenu")}
          >
            <Avatar className="size-7 ring-1 ring-border/50">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? t("defaultAvatar")}
                />
              ) : null}
              <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-xs font-medium text-foreground sm:inline max-w-32 truncate">
              {profile?.full_name ?? t("defaultUser")}
            </span>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="min-w-56 bg-popover text-popover-foreground ring-border shadow-xl rounded-xl"
          >
            <div className="px-3 py-2">
              <p className="truncate text-xs font-semibold text-foreground">
                {profile?.full_name ?? t("defaultUser")}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {profile?.email ?? ""}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-border/60" />
            <DropdownMenuItem
              render={
                <Link
                  href="/profile"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                />
              }
            >
              <UserCircle className="size-4 text-primary" />
              <span>My Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  href="/settings"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                />
              }
            >
              <SettingsIcon className="size-4" />
              <span>{t("settings")}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/60" />
            <DropdownMenuItem
              onClick={signOut}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
            >
              <LogOut className="size-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
