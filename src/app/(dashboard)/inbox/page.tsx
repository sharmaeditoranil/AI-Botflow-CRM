"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  normalizeConversation,
} from "@/lib/inbox/conversations";
import type { Conversation, Message, Contact, ConversationStatus } from "@/types";
import { useRealtime } from "@/hooks/use-realtime";
import { ConversationList } from "@/components/inbox/conversation-list";
import { MessageThread } from "@/components/inbox/message-thread";
import { ContactSidebar } from "@/components/inbox/contact-sidebar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardShell } from "../dashboard-shell";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { triggerMobileNotification } from "@/lib/mobile-notify";
import { playNotificationSound } from "@/lib/notifications/sound";

// Remembers the agent's show/hide choice for the desktop contact panel
// across reloads and sessions (device-scoped, like the theme prefs).
const CONTACT_PANEL_STORAGE_KEY = "wacrm:inbox:contact-panel-open";

// `useSearchParams` (the `?c=<id>` deep link below) requires a Suspense
// boundary or the production build bails to CSR and errors out. Thin
// wrapper supplies it; the inner component holds all the inbox state.
export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageInner />
    </Suspense>
  );
}

function phoneMatches(p1?: string | null, p2?: string | null): boolean {
  if (!p1 || !p2) return false;
  const d1 = p1.replace(/\D/g, "");
  const d2 = p2.replace(/\D/g, "");
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  return d1.endsWith(d2) || d2.endsWith(d1);
}

function InboxPageInner() {
  const t = useTranslations("Inbox.page");
  const router = useRouter();
  const { openSidebar } = useDashboardShell();
  const searchParams = useSearchParams();
  /**
   * Deep-link support: `?c=<id>`, `?contactId=<id>`, `?phone=<number>`.
   * Used when landing here from Pipelines deals or contacts so the right thread opens
   * automatically instead of showing the empty center panel or defaulting to a random contact.
   */
  const deepLinkConvId = searchParams.get("c");
  const deepLinkContactId = searchParams.get("contactId");
  const deepLinkPhone = searchParams.get("phone");
  const hasDeepLink = Boolean(deepLinkConvId || deepLinkContactId || deepLinkPhone);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [mobileContactOpen, setMobileContactOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null
  );
  /**
   * Bumped whenever we want children (ConversationList, MessageThread)
   * to refetch from the DB — used as a safety net against missed
   * realtime events. Bumped on WS reconnect and on tab visibility →
   * visible. The initial mount fetches don't depend on this; they fire
   * once on conversationId-change as usual.
   */
  const [resyncToken, setResyncToken] = useState(0);

  /**
   * Whether the desktop contact sidebar (tags / deals / notes) is shown.
   * Defaults to `true` (the historical behaviour) and is restored from
   * localStorage after mount. We deliberately do NOT read localStorage in
   * the initializer: the server renders with `true`, so reading a stored
   * `false` synchronously would produce a hydration mismatch. The effect
   * below reconciles to the stored value right after mount instead.
   */
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONTACT_PANEL_STORAGE_KEY);
      if (stored !== null) setContactPanelOpen(stored === "true");
    } catch {
      // localStorage can throw in private-browsing / sandboxed contexts.
    }
  }, []);

  const handleToggleContactPanel = useCallback(() => {
    setContactPanelOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CONTACT_PANEL_STORAGE_KEY, String(next));
      } catch {
        // Persistence is best-effort; ignore storage failures.
      }
      return next;
    });
  }, []);

  // Fire the deep-link auto-select exactly once per URL — subsequent
  // list refreshes (realtime, manual refetch) must not snap the user
  // back to the deep-linked conversation if they've already clicked
  // elsewhere.
  const autoSelectedForDeepLinkRef = useRef<string | null>(null);

  // Tracks conversations whose hydrate fetch is currently in flight. The
  // conv-INSERT and the first-message-INSERT events both call into
  // hydrateConversation; the dedupe here keeps it at one refetch per
  // new conversation even when both events arrive within milliseconds.
  const hydratingConvIdsRef = useRef<Set<string>>(new Set());

  /**
   * Synchronous mirror of the conversation ids currently in `conversations`
   * state. Event handlers need to know "do we already have this conv?"
   * without waiting for a setState updater to run — updaters fire during
   * reconciliation, *after* the synchronous handler code returns, so a
   * `let foundInList = false; setState(p => { foundInList = ...; return ... })`
   * flag reads as `false` in the same tick (this exact bug shipped in #105
   * and caused #106: every incoming message and every status flip fired a
   * redundant DB hydrate, swamping the supabase client and starving the
   * realtime channel). The ref is kept in sync via the effect below.
   */
  const knownConvIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set<string>();
    for (const c of conversations) next.add(c.id);
    knownConvIdsRef.current = next;
  }, [conversations]);

  // Pull the conversation row with its `contact` joined and merge it
  // into state. Needed because Supabase Realtime payloads only carry the
  // row's own columns — a brand-new conversation arrives without a
  // contact, which surfaced as "Unknown" names, empty avatars, and
  // (when the conv-INSERT event was delayed past the message-INSERT)
  // conversations stuck on "No messages yet" until the user reloaded.
  // Also self-heals if a realtime event was missed: callers can invoke
  // this whenever they reference a conversation id they don't recognise.
  const hydrateConversation = useCallback(async (convId: string) => {
    if (hydratingConvIdsRef.current.has(convId)) return;
    hydratingConvIdsRef.current.add(convId);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .eq("id", convId)
        .maybeSingle();
      if (error) {
        // Supabase errors have non-enumerable properties — log fields
        // explicitly so the console message isn't just `{}`.
        console.error("Failed to hydrate conversation:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return;
      }
      if (!data) return;
      const fetched = normalizeConversation(data);
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === fetched.id);
        if (existing) {
          // Already in state — keep its fields (a realtime UPDATE may
          // have landed while the fetch was in flight and patched
          // last_message_text / unread_count to fresher values than
          // the row we just read). Only backfill `contact`, which the
          // realtime payloads never carry.
          return prev.map((c) =>
            c.id === fetched.id
              ? { ...c, contact: c.contact ?? fetched.contact }
              : c,
          );
        }
        return [fetched, ...prev];
      });
    } finally {
      hydratingConvIdsRef.current.delete(convId);
    }
  }, []);

  // Check WhatsApp connection status on mount
  useEffect(() => {
    const checkConnection = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) return;

      // whatsapp_config is one-row-per-account post-multi-user, so
      // the previous `.eq('user_id', user.id)` would miss the row
      // for any teammate who didn't personally save the config —
      // the "WhatsApp not connected" banner would show in the
      // shared inbox even though the admin had it configured.
      // Resolve account_id via the profile and query by that.
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const accountId = profile?.account_id as string | undefined;
      if (!accountId) {
        setWhatsappConnected(false);
        return;
      }

      const { data } = await supabase
        .from("whatsapp_config")
        .select("status")
        .eq("account_id", accountId)
        .maybeSingle();

      setWhatsappConnected(data?.status === "connected");
    };

    checkConnection();
  }, []);

  // Handle realtime message events
  const handleMessageEvent = useCallback(
    (event: { eventType: string; new: Message; old: Partial<Message> }) => {
      const newMsg = event.new;

      if (event.eventType === "INSERT") {
        // Add to messages if it belongs to active conversation
        if (
          activeConversation &&
          newMsg.conversation_id === activeConversation.id
        ) {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Replace optimistic message if it exists
            const withoutOptimistic = prev.filter(
              (m) => !m.id.startsWith("temp-")
            );
            return [...withoutOptimistic, newMsg];
          });
        }

        // Trigger notification sound + push notification for inbound messages
        // Only for messages NOT sent by the agent (direction === 'inbound' or sender_type !== 'agent')
        const isInbound =
          (newMsg as unknown as { direction?: string }).direction === "inbound" ||
          (newMsg as unknown as { sender_type?: string }).sender_type !== "agent";
        if (isInbound) {
          // Play sound chime immediately
          playNotificationSound();
          // Show push notification when app is not the focused conversation
          const isCurrentConv = activeConversation?.id === newMsg.conversation_id;
          if (!isCurrentConv || document.visibilityState !== "visible") {
            // Find contact details and unread count for notification
            const conv = conversations.find((c) => c.id === newMsg.conversation_id);
            const phone = conv?.contact?.phone || (conv as unknown as { phone_number?: string })?.phone_number || "";
            const name = conv?.contact?.name;
            const senderDisplay = name ? `${name}${phone ? ` (${phone})` : ""}` : (phone || "WhatsApp Message");
            const newUnread = (Number(conv?.unread_count) || 0) + 1;
            const countPrefix = newUnread > 1 ? `[${newUnread} msgs] ` : "";

            triggerMobileNotification({
              title: `${countPrefix}${senderDisplay}`,
              body: newMsg.content_text || "New message received",
            });
          }
        }

        // Update conversation list preview. We need to know *synchronously*
        // whether the conv is already in state to decide between patching
        // the preview and triggering a hydrate — see the comment on
        // knownConvIdsRef for why a closure flag inside the updater would
        // always read false here.
        if (knownConvIdsRef.current.has(newMsg.conversation_id)) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === newMsg.conversation_id
                ? {
                    ...c,
                    last_message_text: newMsg.content_text ?? "",
                    last_message_at: newMsg.created_at,
                    unread_count:
                      activeConversation?.id === newMsg.conversation_id
                        ? 0
                        : (Number(c.unread_count) || 0) + 1,
                  }
                : c,
            ),
          );
        } else {
          // First time we're seeing this conv: the conv-INSERT event
          // hasn't landed yet, or was missed. Hydrate from the DB so
          // the row surfaces with its `contact` joined; the conv-UPDATE
          // event the webhook emits right after the message INSERT will
          // converge state when it arrives.
          hydrateConversation(newMsg.conversation_id);
        }
      }

      if (event.eventType === "UPDATE") {
        // Update message status
        setMessages((prev) =>
          prev.map((m) => (m.id === newMsg.id ? { ...m, ...newMsg } : m))
        );
      }
    },
    [activeConversation, hydrateConversation, conversations]
  );

  // Handle realtime conversation events
  const handleConversationEvent = useCallback(
    (event: {
      eventType: string;
      new: Conversation;
      old: Partial<Conversation>;
    }) => {
      const conv = event.new;

      if (event.eventType === "INSERT") {
        // Prepend immediately for snappy UX so the new conv shows in the
        // list right away, then hydrate to fill in the `contact` join
        // (realtime payloads never include joins). Skip both if we
        // already have the row — that shouldn't happen normally, but
        // out-of-order delivery would have us prepending a duplicate.
        if (!knownConvIdsRef.current.has(conv.id)) {
          setConversations((prev) => {
            if (prev.some((c) => c.id === conv.id)) return prev;
            return [conv, ...prev];
          });
          hydrateConversation(conv.id);
        }
      }

      if (event.eventType === "UPDATE") {
        if (knownConvIdsRef.current.has(conv.id)) {
          // If this UPDATE is for the conv the user is currently viewing,
          // suppress the incoming unread_count — the user is reading it
          // RIGHT NOW, so any positive value would just flicker the badge
          // back on for the ~100ms it takes for the reset effect's server
          // UPDATE to round-trip. Non-active convs take the value as-is.
          const isActive = activeConversation?.id === conv.id;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conv.id
                ? {
                    ...c,
                    ...conv,
                    unread_count: isActive ? 0 : conv.unread_count,
                  }
                : c,
            ),
          );
        } else {
          // UPDATE arrived before the INSERT (or after a missed INSERT)
          // — fetch the row so it surfaces with its contact joined. The
          // patch contained in `conv` will already be reflected in what
          // the hydrate fetch returns.
          hydrateConversation(conv.id);
        }

        // Update active conversation if it changed
        if (activeConversation && conv.id === activeConversation.id) {
          setActiveConversation((prev) =>
            prev ? { ...prev, ...conv } : prev
          );
        }
      }
    },
    [activeConversation, hydrateConversation]
  );

  // Subscribe to realtime. The `isConnected` flag below feeds the
  // reconnect resync: realtime is best-effort and events sent while the
  // WS was disconnected (laptop sleep, network blip, background-tab
  // throttle) are simply lost. We need a way to catch up.
  const { isConnected } = useRealtime({
    channelName: "inbox-realtime",
    onMessageEvent: handleMessageEvent,
    onConversationEvent: handleConversationEvent,
    enabled: true,
  });

  /**
   * Bump `resyncToken` whenever the realtime channel transitions from
   * disconnected → connected *after* the initial connect. The initial
   * connect is covered by the children's on-mount fetches; only later
   * reconnects need a manual refetch to fill the gap.
   *
   * Tracked via a `was-connected` ref rather than a count so that React
   * strict-mode's dev-only effect double-fire doesn't read as a
   * reconnect.
   */
  const wasConnectedRef = useRef(false);
  const initialConnectDoneRef = useRef(false);
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      // false → true transition
      if (initialConnectDoneRef.current) {
        setResyncToken((n) => n + 1);
      } else {
        initialConnectDoneRef.current = true;
      }
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  /**
   * Refetch when the tab regains focus. Background tabs may have their
   * WS throttled by the browser even without a full disconnect, so a
   * visibilitychange → visible is a reliable signal that we may have
   * missed events. Cheap to fire; the children dedupe on their own.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setResyncToken((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /**
   * Manual refresh trigger for the thread-header refresh button.
   * Bumps the same resyncToken the reconnect / visibility paths use,
   * so it goes through the existing dedupe & refetch plumbing — no
   * separate code path to keep in sync.
   */
  const handleManualRefresh = useCallback(() => {
    setResyncToken((n) => n + 1);
  }, []);

  const handleConversationsLoaded = useCallback(
    (loaded: Conversation[]) => {
      setConversations(loaded);

      const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;

      if (hasDeepLink) {
        // Find matching conversation in loaded list
        const targetConv = loaded.find((c) => {
          if (deepLinkConvId && c.id === deepLinkConvId) return true;
          if (
            deepLinkContactId &&
            (c.contact_id === deepLinkContactId || c.contact?.id === deepLinkContactId)
          )
            return true;
          if (deepLinkPhone && phoneMatches(c.contact?.phone, deepLinkPhone)) return true;
          return false;
        });

        if (targetConv && autoSelectedForDeepLinkRef.current !== targetConv.id) {
          autoSelectedForDeepLinkRef.current = targetConv.id;
          setActiveConversation(targetConv);
          setActiveContact(targetConv.contact ?? null);
          setMessages([]);
          if (targetConv.unread_count > 0) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === targetConv.id ? { ...c, unread_count: 0 } : c,
              ),
            );
          }
          return;
        }
      }

      // Default desktop auto-select if NO deep link is requested
      if (!hasDeepLink && isDesktop && loaded.length > 0 && !activeConversation) {
        const targetConv = loaded[0];
        if (targetConv && autoSelectedForDeepLinkRef.current !== targetConv.id) {
          autoSelectedForDeepLinkRef.current = targetConv.id;
          setActiveConversation(targetConv);
          setActiveContact(targetConv.contact ?? null);
          setMessages([]);
          if (targetConv.unread_count > 0) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === targetConv.id ? { ...c, unread_count: 0 } : c,
              ),
            );
          }
        }
      }
    },
    [deepLinkConvId, deepLinkContactId, deepLinkPhone, hasDeepLink, activeConversation]
  );

  // Deep-link resolver: when arriving via ?contactId=... or ?phone=... or ?c=...,
  // if the target conversation is not in the initially loaded list or doesn't exist yet in DB,
  // locate or create it and immediately open the chat.
  const deepLinkResolvedRef = useRef(false);
  useEffect(() => {
    if (!hasDeepLink || deepLinkResolvedRef.current) return;

    // If already active and matches deep link, mark resolved
    if (activeConversation) {
      if (deepLinkConvId && activeConversation.id === deepLinkConvId) {
        deepLinkResolvedRef.current = true;
        return;
      }
      if (
        deepLinkContactId &&
        (activeConversation.contact_id === deepLinkContactId ||
          activeConversation.contact?.id === deepLinkContactId)
      ) {
        deepLinkResolvedRef.current = true;
        return;
      }
      if (deepLinkPhone && phoneMatches(activeConversation.contact?.phone, deepLinkPhone)) {
        deepLinkResolvedRef.current = true;
        return;
      }
    }

    // Check if matching conversation is already present in conversations state
    const inList = conversations.find((c) => {
      if (deepLinkConvId && c.id === deepLinkConvId) return true;
      if (
        deepLinkContactId &&
        (c.contact_id === deepLinkContactId || c.contact?.id === deepLinkContactId)
      )
        return true;
      if (deepLinkPhone && phoneMatches(c.contact?.phone, deepLinkPhone)) return true;
      return false;
    });

    if (inList) {
      deepLinkResolvedRef.current = true;
      autoSelectedForDeepLinkRef.current = inList.id;
      setActiveConversation(inList);
      setActiveContact(inList.contact ?? null);
      setMessages([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user || cancelled) return;
        const user = session.user;

        const { data: profile } = await supabase
          .from("profiles")
          .select("account_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const accountId = profile?.account_id as string | undefined;

        let targetConv: Conversation | null = null;

        // 1. Try by conversation id
        if (deepLinkConvId) {
          const { data } = await supabase
            .from("conversations")
            .select(CONVERSATION_SELECT)
            .eq("id", deepLinkConvId)
            .maybeSingle();
          if (data) {
            targetConv = normalizeConversation(data as any);
          }
        }

        // 2. Try by contact_id
        if (!targetConv && deepLinkContactId) {
          const { data } = await supabase
            .from("conversations")
            .select(CONVERSATION_SELECT)
            .eq("contact_id", deepLinkContactId)
            .order("last_message_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            targetConv = normalizeConversation(data as any);
          }
        }

        // 3. Try by phone
        if (!targetConv && deepLinkPhone && accountId) {
          const cleanPhone = deepLinkPhone.replace(/\D/g, "");
          const { data: contacts } = await supabase
            .from("contacts")
            .select("id, phone")
            .eq("account_id", accountId)
            .limit(25);
          const matched = (contacts || []).find((c) => phoneMatches(c.phone, cleanPhone));
          if (matched) {
            const { data } = await supabase
              .from("conversations")
              .select(CONVERSATION_SELECT)
              .eq("contact_id", matched.id)
              .order("last_message_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data) {
              targetConv = normalizeConversation(data as any);
            }
          }
        }

        // 4. If no conversation exists in DB yet, create one for this contact/phone so chat opens immediately
        if (!targetConv && (deepLinkContactId || deepLinkPhone) && accountId) {
          let resolvedContactId = deepLinkContactId;

          if (!resolvedContactId && deepLinkPhone) {
            const cleanPhone = deepLinkPhone.replace(/\D/g, "");
            const { data: existingContact } = await supabase
              .from("contacts")
              .select("id")
              .eq("account_id", accountId)
              .ilike("phone", `%${cleanPhone.slice(-10)}%`)
              .maybeSingle();

            if (existingContact) {
              resolvedContactId = existingContact.id;
            } else {
              const formattedPhone = deepLinkPhone.startsWith("+") ? deepLinkPhone : `+${deepLinkPhone}`;
              const { data: newContact } = await supabase
                .from("contacts")
                .insert({
                  account_id: accountId,
                  phone: formattedPhone,
                  name: `Contact ${formattedPhone.slice(-4)}`,
                })
                .select("id")
                .single();
              if (newContact) resolvedContactId = newContact.id;
            }
          }

          if (resolvedContactId) {
            const { data: newConvRow, error: insertErr } = await supabase
              .from("conversations")
              .insert({
                user_id: user.id,
                account_id: accountId,
                contact_id: resolvedContactId,
                status: "open",
              })
              .select(CONVERSATION_SELECT)
              .single();

            if (newConvRow) {
              targetConv = normalizeConversation(newConvRow as any);
            } else if (insertErr) {
              const { data: existing } = await supabase
                .from("conversations")
                .select(CONVERSATION_SELECT)
                .eq("account_id", accountId)
                .eq("contact_id", resolvedContactId)
                .maybeSingle();
              if (existing) {
                targetConv = normalizeConversation(existing as any);
              }
            }
          }
        }

        if (cancelled || !targetConv) return;

        deepLinkResolvedRef.current = true;
        autoSelectedForDeepLinkRef.current = targetConv.id;
        setConversations((prev) => {
          if (prev.some((c) => c.id === targetConv!.id)) return prev;
          return [targetConv!, ...prev];
        });
        setActiveConversation(targetConv);
        setActiveContact(targetConv.contact ?? null);
        setMessages([]);
      } catch (err) {
        console.error("Deep link resolution error:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hasDeepLink,
    deepLinkConvId,
    deepLinkContactId,
    deepLinkPhone,
    conversations,
    activeConversation,
  ]);

  const handleSelectConversation = useCallback(
    (conv: Conversation) => {
      // Re-clicking the already-active conversation would clear the
      // messages array, but the fetch effect in MessageThread only re-runs
      // when conversationId changes — so messages would stay empty until
      // the user navigated away and back. Bail out early instead.
      if (activeConversation?.id === conv.id) return;
      setActiveConversation(conv);
      setActiveContact(conv.contact ?? null);
      setMessages([]);
      // Optimistically clear the unread badge for this conv. The
      // server-side reset is fired by the unread-reset effect inside
      // MessageThread (which reads activeConversation.unread_count, not
      // the list copy — so we deliberately leave that intact below to
      // keep the effect firing), and the realtime UPDATE that comes
      // back will sync to 0 again as a no-op. Zeroing the list copy
      // here means the user sees the badge disappear the instant they
      // click instead of waiting for the round-trip — and it persists
      // even if the realtime UPDATE is dropped.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conv.id && c.unread_count > 0
            ? { ...c, unread_count: 0 }
            : c,
        ),
      );
      // Record the selection on the deep-link ref BEFORE we change the
      // URL.
      autoSelectedForDeepLinkRef.current = conv.id;
      // Push history state so Android hardware back button & browser back return to the conversation list
      try {
        window.history.pushState({ conversationId: conv.id }, "", `/inbox?c=${conv.id}`);
      } catch {
        router.replace(`/inbox?c=${conv.id}`, { scroll: false });
      }
    },
    [activeConversation?.id, router]
  );

  // Mobile "back" — deselect the conversation so the list pane comes
  // back. Also clears the ?c= param so a refresh lands on the list
  // instead of re-opening the thread the user just backed out of.
  const handleCloseConversation = useCallback(() => {
    setActiveConversation(null);
    setActiveContact(null);
    setMobileContactOpen(false);
    setMessages([]);
    // Clearing the ref lets the deep-link auto-selector fire again if
    // the user later visits /inbox?c=<same-id> — desirable UX.
    autoSelectedForDeepLinkRef.current = null;
    deepLinkResolvedRef.current = false;
    try {
      window.history.replaceState(null, "", "/inbox");
    } catch {
      router.replace("/inbox", { scroll: false });
    }
  }, [router]);

  // Expose global methods on window so Android hardware back button can close active chat without leaving inbox!
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { __inboxHasActiveConversation?: () => boolean }).__inboxHasActiveConversation = () => {
        return !!activeConversation;
      };
      (window as unknown as { __inboxCloseActiveConversation?: () => boolean }).__inboxCloseActiveConversation = () => {
        handleCloseConversation();
        return true;
      };
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as unknown as { __inboxHasActiveConversation?: () => boolean }).__inboxHasActiveConversation;
        delete (window as unknown as { __inboxCloseActiveConversation?: () => boolean }).__inboxCloseActiveConversation;
      }
    };
  }, [activeConversation, handleCloseConversation]);

  // Handle browser popstate so hardware back also closes active chat naturally
  useEffect(() => {
    const handlePopState = () => {
      if (activeConversation) {
        setActiveConversation(null);
        setActiveContact(null);
        setMessages([]);
        autoSelectedForDeepLinkRef.current = null;
        try {
          window.history.replaceState(null, "", "/inbox");
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeConversation]);


  const handleMessagesLoaded = useCallback((loaded: Message[]) => {
    setMessages(loaded);
  }, []);

  const handleNewMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  const handleUpdateMessage = useCallback(
    (id: string, updates: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    },
    []
  );

  const handleStatusChange = useCallback(
    (conversationId: string, status: ConversationStatus) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status } : c))
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [activeConversation]
  );

  const handleAssignChange = useCallback(
    (conversationId: string, assignedAgentId: string | null) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, assigned_agent_id: assignedAgentId ?? undefined }
            : c
        )
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation((prev) =>
          prev
            ? { ...prev, assigned_agent_id: assignedAgentId ?? undefined }
            : prev
        );
      }
    },
    [activeConversation]
  );

  // On mobile (<lg) we show a SINGLE pane — either the list or the
  // thread — rather than cramming both side-by-side. Selecting a
  // conversation slides the thread in; the thread's back button pops
  // it back to the list. On lg+ both panes render side-by-side as
  // before, unchanged.
  const hasActiveConv = !!activeConversation;

  const resolvedContact: Contact | null =
    activeContact ||
    (activeConversation?.contact
      ? activeConversation.contact
      : activeConversation
      ? ({
          id: activeConversation.contact_id || activeConversation.id,
          account_id: (activeConversation as unknown as { account_id?: string })?.account_id || "",
          name: (activeConversation as unknown as { contact_name?: string }).contact_name || "",
          phone:
            (activeConversation as unknown as { contact_phone?: string; phone_number?: string }).contact_phone ||
            (activeConversation as unknown as { contact_phone?: string; phone_number?: string }).phone_number ||
            "",
          created_at: activeConversation.created_at,
          updated_at: activeConversation.updated_at,
        } as Contact)
      : null);

  return (
    <div className="flex h-full w-full max-w-full min-w-0 flex-col overflow-hidden">
      {/* WhatsApp connection banner — in the flex column, not absolute,
          so it pushes the panels down instead of overlapping them. */}
      {whatsappConnected === false && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
          <WifiOff className="h-4 w-4 text-amber-400" />
          <p className="text-xs text-amber-400">
            {t("whatsappNotConnected")}
          </p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden min-w-0 w-full max-w-full">
        {/* Left panel: Conversation list.
            Hidden on mobile when a conversation is selected so the
            thread can occupy the full width. Always visible on lg+. */}
        <div
          className={cn(
            "flex h-full min-w-0 overflow-hidden lg:w-80 lg:shrink-0 lg:flex-none",
            hasActiveConv ? "hidden lg:flex" : "flex flex-1 w-full max-w-full",
          )}
        >
          <ConversationList
            activeConversationId={activeConversation?.id ?? null}
            onSelect={handleSelectConversation}
            conversations={conversations}
            onConversationsLoaded={handleConversationsLoaded}
            resyncToken={resyncToken}
          />
        </div>

        {/* Center panel: Message thread.
            Hidden on mobile when no conversation is selected so the
            list can occupy the full width. Always visible on lg+
            (shows its own empty-state if no thread is picked yet). */}
        <div
          className={cn(
            "flex h-full min-w-0 flex-1 lg:flex",
            hasActiveConv ? "flex" : "hidden lg:flex",
          )}
        >
          <MessageThread
            conversation={activeConversation}
            contact={resolvedContact}
            messages={messages}
            onMessagesLoaded={handleMessagesLoaded}
            onNewMessage={handleNewMessage}
            onUpdateMessage={handleUpdateMessage}
            onStatusChange={handleStatusChange}
            onAssignChange={handleAssignChange}
            onBack={handleCloseConversation}
            resyncToken={resyncToken}
            onRefresh={handleManualRefresh}
            contactPanelOpen={contactPanelOpen}
            onToggleContactPanel={handleToggleContactPanel}
            onOpenContactDetails={() => setMobileContactOpen(true)}
          />
        </div>

        {/* Right panel: Contact sidebar — desktop only, and only when the
            agent hasn't collapsed it via the thread-header toggle (#258). */}
        {contactPanelOpen && (
          <div className="hidden lg:flex h-full min-h-0 overflow-hidden shrink-0">
            <ContactSidebar contact={resolvedContact} conversationId={activeConversation?.id} />
          </div>
        )}
      </div>

      {/* Mobile Contact Sidebar Sheet (Tags, Automations, Notes, Deals) */}
      <Sheet open={mobileContactOpen} onOpenChange={setMobileContactOpen}>
        <SheetContent
          side="right"
          className="w-[90vw] max-w-[390px] p-0 flex flex-col h-full bg-card border-l border-border"
        >
          <SheetHeader className="px-4 py-3 border-b border-border bg-muted/30">
            <SheetTitle className="text-base font-semibold text-foreground truncate">
              {resolvedContact?.name || resolvedContact?.phone || (activeConversation as unknown as { contact_phone?: string })?.contact_phone || "Contact Details"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Contact tags, assigned automations, deals and notes
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-hidden min-h-0">
            <ContactSidebar
              contact={resolvedContact}
              conversationId={activeConversation?.id}
              className="w-full border-l-0"
              onClose={() => setMobileContactOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Render Mobile Bottom Navigation only when viewing conversation list on mobile */}
      {!hasActiveConv && <MobileBottomNav onOpenMenu={openSidebar} />}
    </div>
  );
}
