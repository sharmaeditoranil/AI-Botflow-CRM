"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from "@/lib/inbox/conversations";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus, Tag, Contact } from "@/types";
import { Search, ChevronDown, X, ListFilter, UserPlus } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  WhatsAppIcon,
  MessengerIcon,
  InstagramIcon,
} from "@/components/icons/social-icons";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  resyncToken?: number;
}

export type PlatformFilter = "all" | "whatsapp" | "facebook" | "instagram";
type InboxFilter = ConversationStatus | "all" | "unread";
type TabFilter = "all" | "unread" | "mine";

const AVATAR_COLORS = [
  "bg-[#0e3b33] text-[#2dd4bf]", // PN: Dark teal
  "bg-[#451a03] text-[#f59e0b]", // KT: Dark amber
  "bg-[#172554] text-[#60a5fa]", // RS: Dark blue
  "bg-[#4c0519] text-[#fb7185]", // MI: Dark rose
  "bg-[#1e293b] text-[#94a3b8]", // VG: Dark slate
  "bg-[#3b0764] text-[#c084fc]", // Dark purple
  "bg-[#14532d] text-[#4ade80]", // Dark emerald
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatWhatsAppTime(dateStr?: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24 && isToday(date)) return `${diffHours}h`;
  if (isYesterday(date)) return "Yesterday";
  return format(date, "dd/MM/yy");
}

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  const { user } = useAuth();
  const router = useRouter();

  const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(() => [
    { label: t("filterAll"), value: "all" },
    { label: t("filterUnread"), value: "unread" },
    { label: t("filterOpen"), value: "open" },
    { label: t("filterPending"), value: "pending" },
    { label: t("filterClosed"), value: "closed" },
  ], [t]);

  const [search, setSearch] = useState("");
  const [tabFilter, setTabFilter] = useState<TabFilter>("all");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");

  // Contact-based filters
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  // Dynamic unread counters per social platform
  const platformCounts = useMemo(() => {
    let all = 0;
    let whatsapp = 0;
    let facebook = 0;
    let instagram = 0;

    for (const c of conversations) {
      const unread = Number(c.unread_count) || 0;
      if (unread > 0) {
        all += unread;
        const ch = c.channel || "whatsapp";
        if (ch === "facebook") facebook += unread;
        else if (ch === "instagram") instagram += unread;
        else whatsapp += unread;
      }
    }
    return { all, whatsapp, facebook, instagram };
  }, [conversations]);

  // Derived counts for tabs
  const totalUnread = useMemo(() => {
    return conversations.filter((c) => (Number(c.unread_count) || 0) > 0).length;
  }, [conversations]);

  const userId = user?.id;
  const mineCount = useMemo(() => {
    if (!userId) return 0;
    return conversations.filter((c) => c.assigned_agent_id === userId).length;
  }, [conversations, userId]);

  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .order("last_message_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch conversations:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
    })();

    return () => {
      cancelled = true;
    };
  }, [resyncToken]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const tg of tags) m.set(tg.id, tg);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    let result = conversations;

    // Platform
    if (platformFilter !== "all") {
      result = result.filter((c) => (c.channel || "whatsapp") === platformFilter);
    }

    // Tab Filter
    if (tabFilter === "unread") {
      result = result.filter((c) => (Number(c.unread_count) || 0) > 0);
    } else if (tabFilter === "mine" && userId) {
      result = result.filter((c) => c.assigned_agent_id === userId);
    }

    // Status filter
    if (filter === "unread") {
      result = result.filter((c) => (Number(c.unread_count) || 0) > 0);
    } else if (filter !== "all") {
      result = result.filter((c) => c.status === filter);
    }

    // Contact tags & company
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [conversations, platformFilter, tabFilter, filter, userId, selectedTagIds, selectedCompany, search]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const hasContactFilters = selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  return (
    <div className="relative flex h-full w-full flex-col bg-[#111b21] text-[#e9edef] lg:bg-card lg:text-foreground lg:w-80 lg:border-r lg:border-border overflow-hidden">
      {/* Top Header - Sticky */}
      <div className="sticky top-0 z-10 bg-[#111b21] flex items-center justify-between px-4 pt-3 pb-2 shrink-0 border-b border-[#222d34]/60 lg:border-border/30">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-[#e9edef] lg:text-foreground">Inbox</h1>
          {/* Subtle live realtime connection indicator */}
          <span className="flex h-2 w-2 relative ml-0.5" title="Live sync">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00a884] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00a884]" />
          </span>
        </div>
        {/* Right side actions: Search & Filter right in front of Inbox (matching PC view) */}
        <div className="flex items-center gap-2">
          {/* Search Button */}
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("inbox-search-input");
              if (el) {
                el.focus();
                el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }}
            aria-label="Search"
            title="Search"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#202c33] hover:bg-[#2a3942] text-[#aebac1] transition-all active:scale-95 border border-white/[0.04] lg:border-border/40 lg:bg-muted/60 lg:hover:bg-muted lg:text-foreground shadow-xs"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Filter Button with Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "relative flex h-10 w-10 items-center justify-center rounded-full bg-[#202c33] hover:bg-[#2a3942] text-[#aebac1] transition-all active:scale-95 border border-white/[0.04] lg:border-border/40 lg:bg-muted/60 lg:hover:bg-muted lg:text-foreground shadow-xs",
                hasContactFilters || filter !== "all"
                  ? "bg-[#00a884]/20 text-[#00a884] border-[#00a884]/40"
                  : ""
              )}
              aria-label="Filter"
              title="Filter"
            >
              <ListFilter className="h-5 w-5" />
              {(hasContactFilters || filter !== "all") && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#00a884] ring-2 ring-[#111b21] lg:ring-card" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-border bg-popover shadow-lg">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Status Filter
              </div>
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "text-sm flex items-center justify-between",
                    filter === opt.value ? "text-primary font-medium" : "text-popover-foreground"
                  )}
                >
                  <span>{opt.label}</span>
                  {filter === opt.value && <span className="text-xs">✓</span>}
                </DropdownMenuItem>
              ))}

              {tags.length > 0 && (
                <>
                  <DropdownMenuSeparator className="bg-border" />
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("tags")}
                  </div>
                  {tags.slice(0, 8).map((tg) => (
                    <DropdownMenuCheckboxItem
                      key={tg.id}
                      checked={selectedTagIds.includes(tg.id)}
                      onCheckedChange={() => toggleTag(tg.id)}
                      className="text-sm text-popover-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: tg.color }}
                        />
                        <span className="truncate">{tg.name}</span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              )}

              {companies.length > 0 && (
                <>
                  <DropdownMenuSeparator className="bg-border" />
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("company")}
                  </div>
                  <DropdownMenuItem
                    onClick={() => setSelectedCompany(null)}
                    className={cn("text-sm", selectedCompany === null && "text-primary font-medium")}
                  >
                    {t("allCompanies")}
                  </DropdownMenuItem>
                  {companies.slice(0, 5).map((co) => (
                    <DropdownMenuItem
                      key={co}
                      onClick={() => setSelectedCompany(co)}
                      className={cn("text-sm", selectedCompany === co && "text-primary font-medium")}
                    >
                      <span className="truncate">{co}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {hasContactFilters && (
                <>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem
                    onClick={clearContactFilters}
                    className="text-xs text-rose-500 font-medium justify-center"
                  >
                    {t("clearAll")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Modern Search Bar */}
      <div className="px-4 py-2 shrink-0 bg-[#111b21]">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 h-4 w-4 text-[#8696a0] pointer-events-none" />
          <Input
            id="inbox-search-input"
            value={search}
            onChange={handleSearchChange}
            placeholder={t("searchPlaceholder") || "Search conversations..."}
            className="h-10 border-0 bg-[#202c33] pl-10 pr-9 text-sm text-[#d1d7db] placeholder:text-[#8696a0] rounded-xl focus-visible:ring-1 focus-visible:ring-[#00a884] transition-all lg:bg-muted/80 lg:border lg:border-border lg:text-foreground"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 p-1 rounded-full text-[#8696a0] hover:text-[#d1d7db] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills Row */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-1.5 no-scrollbar shrink-0 bg-[#111b21]">
        {/* All · 24 */}
        <button
          type="button"
          onClick={() => {
            setTabFilter("all");
            setFilter("all");
          }}
          className={cn(
            "inline-flex items-center shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all active:scale-95",
            tabFilter === "all" && filter === "all"
              ? "bg-[#00a884] text-[#111b21] font-bold shadow-none"
              : "bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942] hover:text-[#d1d7db] lg:border-border/40 lg:bg-muted/70 lg:text-muted-foreground"
          )}
        >
          <span>All</span>
          <span className="mx-1 opacity-70">·</span>
          <span>{conversations.length}</span>
        </button>

        {/* Multi-Channel Dots Dropdown: 🟢🔴🔵 ▾ */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "inline-flex items-center gap-1.5 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95",
              platformFilter !== "all"
                ? "bg-[#00a884]/20 text-[#00a884] font-bold border border-[#00a884]/40"
                : "bg-[#202c33] text-[#aebac1] hover:bg-[#2a3942] lg:border-border/40 lg:bg-muted/70 lg:text-muted-foreground"
            )}
          >
            {platformFilter === "all" ? (
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-[#25D366] shadow-xs" />
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] shadow-xs" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#0084FF] shadow-xs" />
              </span>
            ) : platformFilter === "whatsapp" ? (
              <span className="flex items-center gap-1.5 text-[#25D366] font-bold">
                <WhatsAppIcon className="h-3 w-3 fill-current" />
                <span>WhatsApp</span>
              </span>
            ) : platformFilter === "facebook" ? (
              <span className="flex items-center gap-1.5 text-[#0084FF] font-bold">
                <MessengerIcon className="h-3 w-3 fill-current" />
                <span>Facebook</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-pink-400 font-bold">
                <InstagramIcon className="h-3 w-3 fill-current" />
                <span>Instagram</span>
              </span>
            )}
            <ChevronDown className="h-3 w-3 opacity-70 ml-0.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="border-border bg-popover shadow-md">
            <DropdownMenuItem
              onClick={() => setPlatformFilter("all")}
              className={cn(
                "text-sm flex items-center justify-between gap-3",
                platformFilter === "all" && "text-primary font-bold"
              )}
            >
              <span>All Channels</span>
              <span className="text-xs text-muted-foreground">({conversations.length})</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setPlatformFilter("whatsapp")}
              className={cn(
                "text-sm flex items-center justify-between gap-3",
                platformFilter === "whatsapp" && "text-emerald-500 font-bold"
              )}
            >
              <span className="flex items-center gap-2">
                <WhatsAppIcon className="h-3.5 w-3.5 fill-current text-emerald-500" /> WhatsApp
              </span>
              {platformCounts.whatsapp > 0 && (
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.2 text-[10px] font-bold text-emerald-500">
                  {platformCounts.whatsapp}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setPlatformFilter("facebook")}
              className={cn(
                "text-sm flex items-center justify-between gap-3",
                platformFilter === "facebook" && "text-blue-500 font-bold"
              )}
            >
              <span className="flex items-center gap-2">
                <MessengerIcon className="h-3.5 w-3.5 fill-current text-blue-500" /> Facebook
              </span>
              {platformCounts.facebook > 0 && (
                <span className="rounded-full bg-blue-500/15 px-1.5 py-0.2 text-[10px] font-bold text-blue-500">
                  {platformCounts.facebook}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setPlatformFilter("instagram")}
              className={cn(
                "text-sm flex items-center justify-between gap-3",
                platformFilter === "instagram" && "text-pink-500 font-bold"
              )}
            >
              <span className="flex items-center gap-2">
                <InstagramIcon className="h-3.5 w-3.5 fill-current text-pink-500" /> Instagram
              </span>
              {platformCounts.instagram > 0 && (
                <span className="rounded-full bg-pink-500/15 px-1.5 py-0.2 text-[10px] font-bold text-pink-500">
                  {platformCounts.instagram}
                </span>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Unread · 3 */}
        <button
          type="button"
          onClick={() => {
            setTabFilter(tabFilter === "unread" ? "all" : "unread");
          }}
          className={cn(
            "inline-flex items-center shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all active:scale-95",
            tabFilter === "unread"
              ? "bg-[#00a884] text-[#111b21] font-bold shadow-none"
              : "bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942] hover:text-[#d1d7db] lg:border-border/40 lg:bg-muted/70 lg:text-muted-foreground"
          )}
        >
          <span>Unread</span>
          <span className="mx-1 opacity-70">·</span>
          <span>{totalUnread}</span>
        </button>

        {/* Mine · 9 */}
        <button
          type="button"
          onClick={() => {
            setTabFilter(tabFilter === "mine" ? "all" : "mine");
          }}
          className={cn(
            "inline-flex items-center shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all active:scale-95",
            tabFilter === "mine"
              ? "bg-[#00a884] text-[#111b21] font-bold shadow-none"
              : "bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942] hover:text-[#d1d7db] lg:border-border/40 lg:bg-muted/70 lg:text-muted-foreground"
          )}
        >
          <span>Mine</span>
          <span className="mx-1 opacity-70">·</span>
          <span>{mineCount}</span>
        </button>
      </div>

      {hasContactFilters && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
          {selectedTagIds.map((id) => {
            const tag = tagsById.get(id);
            return (
              <button
                key={id}
                onClick={() => toggleTag(id)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag?.color ?? "var(--muted-foreground)" }}
                />
                <span className="max-w-24 truncate">{tag?.name ?? t("tags")}</span>
                <X className="h-3 w-3" />
              </button>
            );
          })}
          {selectedCompany && (
            <button
              onClick={() => setSelectedCompany(null)}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
            >
              <span className="max-w-24 truncate">{selectedCompany}</span>
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={clearContactFilters}
            className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {t("clearAll")}
          </button>
        </div>
      )}

      {/* Conversation Items List with native touch scrolling */}
      <div className="min-h-0 flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior-y:none] [touch-action:pan-y] pb-24">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] border border-white/10 mb-3">
              <Search className="h-6 w-6 text-neutral-500" />
            </div>
            <p className="text-sm font-semibold text-neutral-300">
              {search ? t("noMatchingConversations") : t("noConversations")}
            </p>
            <p className="mt-1 text-xs text-neutral-500 max-w-xs">
              {search ? t("tryDifferentSearch") : t("conversationsWillAppear")}
            </p>
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-3 text-xs font-semibold text-[#00a884] hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              contact={conv.contact}
              isActive={conv.id === activeConversationId}
              onSelect={handleSelect}
              t={t}
            />
          ))
        )}
      </div>

      {/* Floating Action Button (FAB) - Compact Add Subscriber Button */}
      <button
        type="button"
        onClick={() => router.push("/contacts")}
        className="fixed bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[#00a884] text-white shadow-[0_4px_18px_rgba(0,168,132,0.45)] hover:bg-[#02906f] active:scale-90 transition-all lg:hidden"
        aria-label="Add Subscriber"
        title="Add Subscriber"
      >
        <UserPlus className="h-5.5 w-5.5" />
      </button>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  contact?: Contact | null;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  t: (key: string) => string;
}

function ConversationItem({
  conversation,
  contact,
  isActive,
  onSelect,
  t,
}: ConversationItemProps) {
  const displayName =
    contact?.name ||
    contact?.phone ||
    (conversation as unknown as { contact_phone?: string; phone_number?: string }).contact_phone ||
    (conversation as unknown as { contact_phone?: string; phone_number?: string }).phone_number ||
    t("unknownContact");
  const initials =
    displayName
      .split(" ")
      .map((w: string) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "WA";
  const channel = conversation.channel || "whatsapp";

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeDisplay = formatWhatsAppTime(conversation.last_message_at);
  const avatarBg = getAvatarColor(displayName);
  const previewText = conversation.last_message_text || t("noMessagesYet");
  const unreadCount = Number(conversation.unread_count) || 0;

  return (
    <div className="relative group">
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-3.5 px-4 py-3 text-left transition-all relative select-none",
          isActive
            ? "bg-[#2a3942] lg:border-l-2 lg:border-[#00a884]"
            : "hover:bg-[#202c33] active:bg-[#2a3942]"
        )}
      >
        {/* Avatar with Channel Badge */}
        <div className="relative shrink-0">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full font-bold text-sm tracking-wide shadow-xs select-none",
              contact?.avatar_url ? "bg-muted" : avatarBg
            )}
          >
            {contact?.avatar_url ? (
              <img
                src={contact.avatar_url}
                alt={displayName}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          {/* Overlapping channel badge at bottom right of avatar */}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full ring-2 ring-[#111b21] lg:ring-card shadow-xs text-white",
              channel === "facebook"
                ? "bg-[#0084FF]"
                : channel === "instagram"
                ? "bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888]"
                : "bg-[#25D366]"
            )}
          >
            {channel === "facebook" ? (
              <MessengerIcon className="h-2.5 w-2.5 fill-current" />
            ) : channel === "instagram" ? (
              <InstagramIcon className="h-2.5 w-2.5 fill-current" />
            ) : (
              <WhatsAppIcon className="h-2.5 w-2.5 fill-current" />
            )}
          </span>
        </div>

        {/* Center text content: Name and Preview */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate font-bold text-[15px] text-[#e9edef] lg:text-foreground tracking-tight">
              {displayName}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wider",
                channel === "facebook"
                  ? "bg-blue-500/15 text-[#0084FF] border border-blue-500/30"
                  : channel === "instagram"
                  ? "bg-pink-500/15 text-pink-400 border border-pink-500/30"
                  : "bg-emerald-500/15 text-[#25D366] border border-emerald-500/30"
              )}
            >
              {channel === "facebook" ? "FB" : channel === "instagram" ? "IG" : "WA"}
            </span>
          </div>
          <p className="truncate text-[13px] text-[#8696a0] font-normal leading-relaxed mt-0.5">
            {previewText}
          </p>
        </div>

        {/* Far Right Column: Time on top, Unread Badge on bottom */}
        <div className="flex flex-col items-end justify-between shrink-0 self-stretch py-0.5 ml-2">
          <span className={cn(
            "text-[11px] whitespace-nowrap font-medium transition-colors",
            unreadCount > 0 ? "text-[#00a884] font-bold" : "text-[#8696a0]"
          )}>
            {timeDisplay}
          </span>
          {unreadCount > 0 ? (
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#00a884] px-1.5 text-[11px] font-bold text-[#111b21] shadow-none"
              title={`${unreadCount} unread messages`}
            >
              {unreadCount}
            </span>
          ) : null}
        </div>
      </button>

      {/* Inset Divider starting after avatar — quintessential WhatsApp look */}
      <div className="ml-[72px] border-b border-[#222d34] lg:border-border/30" />
    </div>
  );
}
