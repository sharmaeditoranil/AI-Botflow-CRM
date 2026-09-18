/**
 * Mobile Notification Bridge
 *
 * Calls the native Android bridge (injected via addJavascriptInterface)
 * to show a push notification and/or play a sound when a new message arrives.
 *
 * On web (non-Android), falls back to the Web Notifications API if permission
 * has been granted — the same path the existing BrowserNotificationsListener uses.
 *
 * Usage:
 *   triggerMobileNotification({ title: "John Doe", body: "Hello!" });
 *   playMobileNotificationSound();
 */

interface AndroidBridge {
  showNotification: (title: string, body: string) => void;
  playNotificationSound: () => void;
  isAndroid: () => boolean;
}

declare global {
  interface Window {
    AndroidBridge?: AndroidBridge;
  }
}

/** Returns true when running inside the AI Botflow Android WebView */
export function isAndroidApp(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.AndroidBridge?.isAndroid === "function";
}

/**
 * Play the device's default notification sound via the Android bridge.
 * No-op on web.
 */
export function playMobileNotificationSound(): void {
  try {
    if (typeof window !== "undefined" && window.AndroidBridge?.playNotificationSound) {
      window.AndroidBridge.playNotificationSound();
    }
  } catch {
    // Ignore — bridge may not be available yet
  }
}

/**
 * Show a native Android push notification and play the notification sound.
 * Falls back to the Web Notification API on non-Android browsers if allowed.
 */
export function triggerMobileNotification(opts: {
  title: string;
  body: string;
}): void {
  if (typeof window === "undefined") return;

  const { title, body } = opts;

  // Android native path
  if (window.AndroidBridge?.showNotification) {
    try {
      window.AndroidBridge.showNotification(title, body);
      return;
    } catch {
      // Fall through to web notification
    }
  }

  // Web Notification API fallback (desktop browser)
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/icons/icon-192.png" });
    } catch {
      // Ignore
    }
  }
}
