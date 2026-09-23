"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types";
import {
  DEFAULT_NOTIFICATION_LABELS,
  DEDUPE_WINDOW_MS,
  buildNotificationContent,
  conversationHref,
  getNotificationPermission,
  pickContactDisplayName,
  readBrowserNotifyPref,
  subscribeBrowserNotifyPref,
  viewedConversationFromLocation,
  type NotificationLabels,
} from "@/lib/notifications/browser-notify";
import {
  playNotificationSound,
  useNotificationSoundPref,
} from "@/lib/notifications/sound";

const serverSnapshot = () => false;

/**
 * The device-scoped "browser notifications" opt-in, kept in sync with
 * localStorage across this tab (settings toggle) and other tabs.
 */
export function useBrowserNotifyPref(): boolean {
  return useSyncExternalStore(
    subscribeBrowserNotifyPref,
    readBrowserNotifyPref,
    serverSnapshot,
  );
}

/**
 * Notifications (sound chime & desktop OS popups) for new inbound customer messages.
 * Mount ONCE per signed-in dashboard tab (the dashboard shell does this via
 * <BrowserNotificationsListener />) so alerts fire on any page.
 *
 * Listens for realtime INSERTs on `messages` — RLS scopes the stream to
 * the caller's account, same as useTotalUnread / useRealtime. Only
 * live events are considered: there is no initial fetch, so an existing
 * backlog never produces a burst of alerts on page load.
 */
export function useBrowserNotifications(): void {
  const desktopEnabled = useBrowserNotifyPref();
  const soundEnabled = useNotificationSoundPref();
  const router = useRouter();
  const t = useTranslations("Settings.browserNotifications.labels");

  // Translated labels, read inside the async Realtime callback. Kept in
  // a ref (assigned in an effect, not during render) so a locale change
  // doesn't tear down and re-open the channel.
  const labelsRef = useRef<NotificationLabels>(DEFAULT_NOTIFICATION_LABELS);
  useEffect(() => {
    labelsRef.current = {
      fallbackTitle: t("fallbackTitle"),
      image: t("image"),
      audio: t("audio"),
      video: t("video"),
      document: t("document"),
      location: t("location"),
      template: t("template"),
    };
  });

  // Message ids already handled, for replay dedupe. Survives re-renders.
  const seenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[PWA] Service worker registration notice:", err);
      });
    }

    // Only run if either desktop notifications or sound notifications are enabled
    if (!desktopEnabled && !soundEnabled) return;

    const supabase = createClient();
    let cancelled = false;

    const showDesktopNotification = async (msg: Message) => {
      if (!desktopEnabled || getNotificationPermission() !== "granted") return;

      // Contact name query for title
      const { data } = await supabase
        .from("conversations")
        .select("contact:contacts(name, wa_username, phone)")
        .eq("id", msg.conversation_id)
        .maybeSingle();
      if (cancelled) return;

      const contact = (data as {
        contact?: { name?: string | null; wa_username?: string | null; phone?: string | null } | null;
      } | null)?.contact;
      const { title, body } = buildNotificationContent(
        msg,
        pickContactDisplayName(contact),
        labelsRef.current,
      );

      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (reg && "showNotification" in reg) {
            await reg.showNotification(title, {
              body,
              tag: msg.conversation_id,
              icon: "/brand/app-icon-192.png",
              badge: "/brand/app-icon-64.png",
              data: { url: conversationHref(msg.conversation_id) },
            });
            return;
          }
        }

        const notification = new Notification(title, {
          body,
          tag: msg.conversation_id,
          icon: "/brand/app-icon-192.png",
        });
        notification.onclick = () => {
          window.focus();
          router.push(conversationHref(msg.conversation_id));
          notification.close();
        };
      } catch (err) {
        console.error("[useBrowserNotifications] failed to show:", err);
      }
    };

    const channel = supabase
      .channel("browser-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          // Only alert for customer messages (not agent or bot sends)
          if (msg.sender_type !== "customer") return;

          // Dedupe against Realtime reconnect replays
          const now = Date.now();
          for (const [id, at] of seenRef.current) {
            if (now - at > DEDUPE_WINDOW_MS) seenRef.current.delete(id);
          }
          if (seenRef.current.has(msg.id)) return;
          seenRef.current.set(msg.id, now);

          // 1. Play sound chime alert
          if (soundEnabled) {
            playNotificationSound();
          }

          // 2. Desktop notification popup: skip if user is actively in this conversation
          const isViewingThisConversation =
            document.visibilityState === "visible" &&
            viewedConversationFromLocation(
              window.location.pathname,
              window.location.search,
            ) === msg.conversation_id;

          if (!isViewingThisConversation) {
            void showDesktopNotification(msg);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [desktopEnabled, soundEnabled, router]);
}
