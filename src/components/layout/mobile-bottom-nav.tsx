"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, MessageSquare, Users, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  onOpenMenu: () => void;
  hideOnActiveChat?: boolean;
}

export function MobileBottomNav({ onOpenMenu, hideOnActiveChat = false }: MobileBottomNavProps) {
  const pathname = usePathname();

  if (hideOnActiveChat) {
    return null;
  }

  const isHome = pathname === "/dashboard" || pathname === "/";
  const isInbox = pathname?.startsWith("/inbox");
  const isContacts = pathname?.startsWith("/contacts");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-border/40 bg-background/95 backdrop-blur-md px-2 lg:hidden">
      <Link
        href="/dashboard"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors",
          isHome
            ? "text-[#00a884] dark:text-emerald-400 font-semibold"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <LayoutGrid className={cn("h-5 w-5", isHome && "stroke-[2.5]")} />
        <span className="text-[11px]">Home</span>
      </Link>

      <Link
        href="/inbox"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors",
          isInbox
            ? "text-[#00a884] dark:text-emerald-400 font-semibold"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <MessageSquare className={cn("h-5 w-5", isInbox && "stroke-[2.5]")} />
        <span className="text-[11px]">Inbox</span>
      </Link>

      <Link
        href="/contacts"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors",
          isContacts
            ? "text-[#00a884] dark:text-emerald-400 font-semibold"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Users className={cn("h-5 w-5", isContacts && "stroke-[2.5]")} />
        <span className="text-[11px]">Contacts</span>
      </Link>

      <button
        type="button"
        onClick={onOpenMenu}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <MoreHorizontal className="h-5 w-5" />
        <span className="text-[11px]">Menu</span>
      </button>
    </nav>
  );
}
