"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import {
  Bell,
  Bot,
  Crown,
  GitBranch,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Radio,
  Settings,
  Shield,
  ShieldAlert,
  CreditCard,
  User,
  UserCircle,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  Smartphone,
  X,
  Zap,
  Store,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";
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
import { useTranslations } from "next-intl";

const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: {
    icon: Crown,
    labelKey: "roleOwner",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  admin: {
    icon: Shield,
    labelKey: "roleAdmin",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  agent: {
    icon: UserCog,
    labelKey: "roleAgent",
    className: "border-border bg-muted text-foreground",
  },
  viewer: {
    icon: User,
    labelKey: "roleViewer",
    className: "border-border bg-card text-muted-foreground",
  },
};

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  beta?: boolean;
  badge?: string;
}

interface NavGroup {
  id: string;
  titleKey: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    id: "overview",
    titleKey: "navOverview",
    items: [
      { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
      { href: "/notifications", labelKey: "notifications", icon: Bell },
    ],
  },
  {
    id: "crm",
    titleKey: "navCrm",
    items: [
      { href: "/inbox", labelKey: "inbox", icon: MessageSquare },
      { href: "/contacts", labelKey: "contacts", icon: Users },
      { href: "/pipelines", labelKey: "pipelines", icon: GitBranch },
    ],
  },
  {
    id: "ai",
    titleKey: "navAi",
    items: [
      { href: "/broadcasts", labelKey: "broadcasts", icon: Radio },
      { href: "/automations", labelKey: "automations", icon: Zap },
      { href: "/flows", labelKey: "flows", icon: Workflow },
      { href: "/agents", labelKey: "aiAgents", icon: Bot },
    ],
  },
  {
    id: "growth",
    titleKey: "navGrowth",
    items: [
      { href: "/gmb", labelKey: "gmb", icon: Store, badge: "New" },
    ],
  },
  {
    id: "account",
    titleKey: "navAccount",
    items: [
      { href: "/profile", labelKey: "profile", icon: UserCircle },
      { href: "/billing", labelKey: "billing", icon: CreditCard },
      { href: "/settings", labelKey: "settings", icon: Settings },
    ],
  },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole, isSuperAdmin, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();

  const showAccountStrip =
    !profileLoading &&
    !!account?.name &&
    account.name !== profile?.full_name;

  useEffect(() => {
    onClose?.();
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Mobile Backdrop */}
      <button
        type="button"
        aria-label={t("closeMenu")}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Main Sidebar Shell */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r border-border/70 bg-card/95 backdrop-blur-md",
          "transition-transform duration-200 ease-out will-change-transform shadow-lg lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:w-[252px] lg:translate-x-0 lg:transition-none"
        )}
        aria-label={t("primaryNav")}
      >
        {/* Brand Header */}
        <div className="flex h-15 shrink-0 items-center justify-between border-b border-border/60 px-4">
          <Link
            href="/dashboard"
            className="group flex items-center gap-3 transition-transform duration-150 hover:scale-[1.01]"
          >
            <div className="relative flex items-center justify-center">
              <BrandLogo size={32} variant="glow" priority />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                {t("title")}
              </span>
              <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground/80">
                AI CRM Platform
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Categorized Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4 [scrollbar-width:thin]">
          {navGroups.map((group) => (
            <div key={group.id} className="space-y-1">
              <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 select-none">
                {t(group.titleKey as string)}
              </div>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));

                  const showUnreadDot =
                    item.href === "/inbox" && totalUnread > 0 && !isActive;

                  const showNotificationBadge =
                    item.href === "/notifications" && unreadNotifications > 0;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group/nav relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-150",
                          isActive
                            ? "bg-primary/15 text-primary font-semibold shadow-xs"
                            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                        )}
                      >
                        {/* Active indicator bar */}
                        {isActive && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary" />
                        )}

                        <item.icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover/nav:text-foreground"
                          )}
                        />
                        <span className="flex-1 truncate">{t(item.labelKey as string)}</span>

                        {/* Beta / New Pill */}
                        {item.beta && (
                          <span
                            aria-label={t("beta")}
                            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider text-amber-300"
                          >
                            {t("beta")}
                          </span>
                        )}

                        {item.badge && (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider text-emerald-400">
                            {item.badge}
                          </span>
                        )}

                        {/* Unread Conversations Ping */}
                        {showUnreadDot && (
                          <span
                            aria-label={t("unreadConversations", { count: totalUnread })}
                            className="relative flex h-2 w-2 shrink-0"
                          >
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                          </span>
                        )}

                        {/* Unread Notifications Count */}
                        {showNotificationBadge && (
                          <span
                            aria-label={t("unreadNotifications", { count: unreadNotifications })}
                            className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
                          >
                            {unreadNotifications > 9 ? "9+" : unreadNotifications}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Super Admin Nav if applicable */}
          {isSuperAdmin && (
            <div className="pt-2 border-t border-border/50">
              <Link
                href="/super-admin"
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150",
                  pathname.startsWith("/super-admin")
                    ? "bg-amber-500/20 text-amber-300 shadow-xs"
                    : "text-amber-400 hover:bg-amber-500/10"
                )}
              >
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
                <span>Super Admin</span>
              </Link>
            </div>
          )}
        </nav>

        {/* Footer & User Workspace Box */}
        <div className="shrink-0 border-t border-border/60 p-3 bg-muted/20 space-y-2">
          {/* Account name display */}
          {showAccountStrip && account?.name ? (
            <div className="flex items-center justify-between gap-1.5 px-2 py-1 text-xs text-muted-foreground bg-muted/40 rounded-lg">
              <div className="flex items-center gap-1.5 min-w-0">
                <UsersRound className="size-3 shrink-0 text-muted-foreground/70" />
                <span className="truncate font-medium text-[11px]" title={account.name}>
                  {account.name}
                </span>
              </div>
              {accountRole ? (
                (() => {
                  const meta = ROLE_CHIP[accountRole];
                  const Icon = meta.icon;
                  return (
                    <span
                      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider ${meta.className}`}
                    >
                      <Icon className="size-2.5" />
                      {t(meta.labelKey as string)}
                    </span>
                  );
                })()
              ) : null}
            </div>
          ) : null}

          {/* Trial banner */}
          {account?.subscription_status === "trialing" && account?.trial_ends_at && (
            <Link
              href="/billing"
              className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 to-transparent px-2.5 py-1.5 text-xs text-amber-300 transition-colors hover:border-amber-500/50"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="size-3 text-amber-400 shrink-0" />
                <span className="font-semibold text-[11px] truncate">Free Trial</span>
              </div>
              <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                Upgrade →
              </span>
            </Link>
          )}

          {/* Android App Link */}
          <a
            href="/downloads/ai-botflow-crm.apk?v=4"
            download="ai-botflow-crm.apk"
            className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/20"
            title="Download Android App APK"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Smartphone className="size-3.5 shrink-0 text-emerald-400" />
              <span className="font-semibold text-[11px] truncate">Android App</span>
            </div>
            <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
              APK ↓
            </span>
          </a>

          {/* User Profile Dropdown Card */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-xl border border-border/40 bg-card/60 p-1.5 text-left transition-colors hover:bg-muted/70 focus:outline-none data-popup-open:bg-muted/70">
              <Avatar className="size-8 shrink-0 ring-1 ring-border/50">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? t("defaultAvatar")}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {profile?.full_name ?? t("defaultUser")}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {profile?.email ?? ""}
                </p>
              </div>
              <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={8}
              className="min-w-56 bg-popover text-popover-foreground ring-border shadow-xl rounded-xl"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/profile"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                  />
                }
              >
                <UserCircle className="size-4 text-primary" />
                {t("menuProfile")}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=whatsapp"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                  />
                }
              >
                <Settings className="size-4" />
                {t("menuSettings")}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <a
                    href="/downloads/ai-botflow-crm.apk?v=4"
                    download="ai-botflow-crm.apk"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                  />
                }
              >
                <Smartphone className="size-4 text-emerald-400" />
                <span>Download Android App</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/60" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
              >
                <LogOut className="size-4" />
                {t("menuSignOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
