// ============================================================
// Web Push Notifications & PWA Registration Helper
// ============================================================

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
    return reg;
  } catch (error) {
    console.error('[PWA] ServiceWorker registration failed:', error);
    return null;
  }
}

export async function requestPushPermission(): Promise<'granted' | 'denied' | 'default'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await registerServiceWorker();
    }
    return permission;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return 'denied';
  }
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

export async function sendLocalTestNotification(title = 'Aibotflow CRM', body = 'Push notifications are active on this device!'): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    const res = await requestPushPermission();
    if (res !== 'granted') return false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg) {
        reg.showNotification(title, {
          body,
          icon: '/brand/app-icon-192.png',
          badge: '/brand/app-icon-64.png',
          data: { url: '/inbox' },
        });
        return true;
      }
    }

    new Notification(title, {
      body,
      icon: '/brand/app-icon-192.png',
    });
    return true;
  } catch (err) {
    console.error('Failed to trigger notification:', err);
    return false;
  }
}
