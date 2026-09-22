// ============================================================
// Aibotflow PWA Service Worker & Web Push Handler
// ============================================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Push notification received
self.addEventListener('push', (event) => {
  let data = {
    title: 'Aibotflow — New WhatsApp Message',
    body: 'You have a new customer conversation waiting in your inbox.',
    icon: '/brand/app-icon-192.png',
    badge: '/brand/app-icon-64.png',
    url: '/inbox',
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/brand/app-icon-192.png',
      badge: data.badge || '/brand/app-icon-64.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/inbox' },
    })
  );
});

// User clicked on the push notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/inbox';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window open with this app
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // If not open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
