/**
 * WhoCares service worker (issue #90) — the client half of web-push delivery.
 *
 * Deliberately tiny: no offline caching, no precache, no Workbox (SPEC.md — PWA
 * for install + push only, offline is out of scope). Its whole job is to turn a
 * push message from `webPushSender` into a system notification and to focus the
 * app when one is tapped.
 *
 * Payload shape (see `src/notifications/webPushSender.ts`):
 *   { "title": string, "body": string, "url"?: string }
 *
 * Served statically from `/sw.js` (root scope) with a no-cache header — see the
 * `headers()` entry in `next.config.ts`.
 */

// Take over as soon as a new version is installed rather than waiting for every
// tab to close — the SW carries no cached assets, so there is nothing stale to
// serve and an updated `push` handler should win immediately.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push with a non-JSON body (or none) still deserves a visible
    // notification — iOS drops a subscription that receives a silent push.
    payload = {};
  }

  const title = payload.title || "WhoCares";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Collapse repeats of the same event so a coalesced burst shows once.
    tag: payload.tag || "whocares",
    renotify: true,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Reuse an open WhoCares tab if there is one.
        if (new URL(client.url).origin === target.origin && "focus" in client) {
          client.focus();
          if ("navigate" in client && client.url !== target.href) client.navigate(target.href);
          return undefined;
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
