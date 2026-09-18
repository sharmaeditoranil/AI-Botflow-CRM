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
import type { Conversation, ConversationStatus, Tag } from "@/types";
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
  "bg-emerald-700 text-emerald-100",
  "bg-teal-700 text-teal-100",
  "bg-blue-700 text-blue-100",
  "bg-indigo-700 text-indigo-100",
  "bg-amber-700 text-amber-100",
  "bg-rose-700 text-rose-100",
  "bg-purple-700 text-purple-100",
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
  const [showSearch, setShowSearch] = useState(false);
  const [tabFilter, setTabFilter] = useState<TabFilter>("all");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [loading, setLoading] = useState(true);

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

  const mineCount = useMemo(() => {
    if (!user?.id) return 0;
    return conversations.filter((c) => c.assigned_agent_id === user.id).length;
  }, [conversations, user?.id]);

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
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
      setLoading(false);
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
    } else if (tabFilter === "mine" && user?.id) {
      result = result.filter((c) => c.assigned_agent_id === user.id);
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
  }, [conversations, platformFilter, tabFilter, filter, user?.id, selectedTagIds, selectedCompany, search]);

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
    <div className="relative flex h-full w-full flex-col bg-card lg:w-80 lg:border-r lg:border-border overflow-hidden">
      {/* Top Header - Exact match to Screenshot 2 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Inbox</h1>
        <div className="flex items-center gap-2">
          {/* Search Button */}
          <button
            type="button"
            onClick={() => setShowSearch((prev) => !prev)}
            aria-label="Search"
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-muted/60 hover:bg-muted text-foreground transition-colors shadow-xs",
              showSearch || search
                ? "border-emerald-500/60 bg-emerald-950/20 text-[#00a884] dark:text-emerald-400"
                : "text-foreground"
            )}
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Filter Button */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-muted/60 hover:bg-muted text-foreground transition-colors shadow-xs",
                hasContactFilters || filter !== "all"
                  ? "border-emerald-500/60 bg-emerald-950/20 text-[#00a884] dark:text-emerald-400"
                  : "text-foreground"
              )}
              aria-label="Filter"
            >
              <ListFilter className="h-4 w-4" />
              {(hasContactFilters || filter !== "all") && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#00a884] ring-2 ring-card" />
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

      {/* Expandable Search Input */}
      {(showSearch || search) && (
        <div className="px-4 py-1.5 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={handleSearchChange}
              placeholder={t("searchPlaceholder")}
              autoFocus
              className="h-9 border-border bg-muted/80 pl-9 pr-8 text-sm text-foreground placeholder-muted-foreground rounded-xl"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter Pills Row - Exact match to Screenshot 2 */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 no-scrollbar shrink-0">
        {/* All · 24 */}
        <button
          type="button"
          onClick={() => {
            setTabFilter("all");
            setFilter("all");
          }}
          className={cn(
            "inline-flex items-center shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
            tabFilter === "all" && filter === "all"
              ? "bg-[#00a884] text-white shadow-xs font-bold"
              : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <span>All</span>
          <span className="mx-1 opacity-70">·</span>
          <span>{conversations.length}</span>
        </button>

        {/* Multi-Channel Dots Dropdown: 🟢🔵🟣 ▾ */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "inline-flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all border",
              platformFilter !== "all"
                ? "border-[#00a884]/40 bg-[#00a884]/15 text-[#00a884] dark:text-emerald-400 font-bold"
                : "border-border/40 bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {platformFilter === "all" ? (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#25D366]" />
                <span className="h-2 w-2 rounded-full bg-[#0084FF]" />
                <span className="h-2 w-2 rounded-full bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888]" />
              </span>
            ) : platformFilter === "whatsapp" ? (
              <span className="flex items-center gap-1 text-[#25D366]">
                <WhatsAppIcon className="h-3 w-3 fill-current" />
                <span>WA</span>
              </span>
            ) : platformFilter === "facebook" ? (
              <span className="flex items-center gap-1 text-[#0084FF]">
                <MessengerIcon className="h-3 w-3 fill-current" />
                <span>FB</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-pink-500">
                <InstagramIcon className="h-3 w-3 fill-current" />
                <span>IG</span>
              </span>
            )}
            <ChevronDown className="h-3 w-3 opacity-70" />
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
                <WhatsAppIcon className="h-3.5 w-3.5 fill-current text-[#25D366]" /> WhatsApp
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
                platformFilter === "facebook" && "text-[#0084FF] font-bold"
              )}
            >
              <span className="flex items-center gap-2">
                <MessengerIcon className="h-3.5 w-3.5 fill-current text-[#0084FF]" /> Facebook
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
            "inline-flex items-center shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
            tabFilter === "unread"
              ? "bg-[#00a884] text-white shadow-xs font-bold"
              : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
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
            "inline-flex items-center shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
            tabFilter === "mine"
              ? "bg-[#00a884] text-white shadow-xs font-bold"
              : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
        <div className="pb-24 lg:pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#00a884] border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t("noConversations")}</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  onSelect={handleSelect}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button (FAB) - Compact Subscriber Add button */}
      <button
        type="button"
        onClick={() => router.push("/contacts")}
        className="fixed bottom-20 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-white shadow-lg hover:bg-[#008f6f] active:scale-95 transition-all lg:hidden"
        aria-label="Add Subscriber"
        title="Add Subscriber / New Chat"
      >
        <UserPlus className="h-5 w-5" />
      </button>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  t: ReturnType<typeof useTranslations>;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  t,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t("unknown");
  const initials = (contact?.name || displayName)
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "WA";
  const channel = conversation.channel || "whatsapp";

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeDisplay = formatWhatsAppTime(conversation.last_message_at);
  const avatarBg = getAvatarColor(displayName);
  const previewText = conversation.last_message_text || t("noMessagesYet");
  const unreadCount = Number(conversation.unread_count) || 0;
  const totalCount = (conversation as unknown as { message_count?: number }).message_count ?? 0;

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors border-b border-border/20 relative",
        isActive
          ? "bg-muted/70 border-l-2 border-[#00a884]"
          : "hover:bg-muted/40"
      )}
    >
      {/* Avatar with Channel Badge */}
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full font-bold text-sm shadow-xs",
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
            "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-card shadow-xs text-white",
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
      <div className="min-w-0 flex-1 overflow-hidden py-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-bold text-[15px] text-foreground tracking-tight">
            {displayName}
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider",
              channel === "facebook"
                ? "bg-blue-500/15 text-[#0084FF]"
                : channel === "instagram"
                ? "bg-pink-500/15 text-pink-400"
                : "bg-emerald-500/15 text-[#00a884] dark:text-emerald-400"
            )}
          >
            {channel === "facebook" ? "FB" : channel === "instagram" ? "IG" : "WA"}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground font-normal leading-relaxed mt-1">
          {previewText}
        </p>
      </div>

      {/* Far Right Column (last me): Time on top, Message Count / Unread Badge on bottom */}
      <div className="flex flex-col items-end justify-between shrink-0 self-stretch py-0.5 ml-2">
        <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
          {timeDisplay}
        </span>
        {unreadCount > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#00a884] px-1.5 text-[11px] font-bold text-white shadow-xs" title={`${unreadCount} unread messages`}>
            {unreadCount}
          </span>
        ) : totalCount > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted/80 border border-border/40 px-1.5 text-[11px] font-medium text-muted-foreground shadow-xs" title={`${totalCount} messages`}>
            {totalCount}
          </span>
        ) : (
          <span className="h-5" />
        )}
      </div>
    </button>
  );
}
