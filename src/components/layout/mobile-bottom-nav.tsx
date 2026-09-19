"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, MessageSquare, Users, Store, MoreHorizontal } from "lucide-react";
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
  const isGmb = pathname?.startsWith("/gmb");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-border/70 bg-card/90 backdrop-blur-xl px-2 lg:hidden shadow-lg">
      <Link
        href="/dashboard"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all",
          isHome
            ? "text-primary font-semibold"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <LayoutGrid className={cn("h-4.5 w-4.5 transition-transform", isHome && "scale-110 stroke-[2.5]")} />
        <span className="text-[10px]">Home</span>
      </Link>

      <Link
        href="/inbox"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all",
          isInbox
            ? "text-primary font-semibold"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <MessageSquare className={cn("h-4.5 w-4.5 transition-transform", isInbox && "scale-110 stroke-[2.5]")} />
        <span className="text-[10px]">Inbox</span>
      </Link>

      <Link
        href="/contacts"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all",
          isContacts
            ? "text-primary font-semibold"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Users className={cn("h-4.5 w-4.5 transition-transform", isContacts && "scale-110 stroke-[2.5]")} />
        <span className="text-[10px]">Contacts</span>
      </Link>

      <Link
        href="/gmb"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all",
          isGmb
            ? "text-primary font-semibold"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Store className={cn("h-4.5 w-4.5 transition-transform", isGmb && "scale-110 stroke-[2.5]")} />
        <span className="text-[10px]">GMB</span>
      </Link>

      <button
        type="button"
        onClick={onOpenMenu}
        className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <MoreHorizontal className="h-4.5 w-4.5" />
        <span className="text-[10px]">Menu</span>
      </button>
    </nav>
  );
}
