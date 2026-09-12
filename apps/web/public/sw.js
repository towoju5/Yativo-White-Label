// Minimal app-shell service worker — just enough to satisfy browser installability criteria and
// give the installed PWA a basic offline fallback. Deliberately NOT caching API responses: this
// app's data (balances, transactions, quotes) must always be live, never served stale from cache.

const CACHE_NAME = "app-shell-v1";
const APP_SHELL = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Web Push — the payload is the plain JSON `{title, body}` sent by sendWebPush() on the API side
// (apps/api/src/modules/notifications/channels/webPush.ts). Shown via the Notifications API, not
// cached or persisted here — the in-app notification center (GET /portal/notifications) is the
// durable record; this is just the OS-level alert.
self.addEventListener("push", (event) => {
  let data = { title: "Notification", body: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      ...(data.icon ? { icon: data.icon, badge: data.icon } : {}),
      data: { url: "/portal" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/portal";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only ever handle same-origin navigation/static-asset requests — every API call (this app's
  // own API on another origin, and any third-party request) passes straight through untouched.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/index.html"))),
  );
});
