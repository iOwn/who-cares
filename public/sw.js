/**
 * WhoCares service worker (issue #90) — the client half of web-push delivery.
 *
 * Deliberately tiny: no offline caching, no precache, no Workbox (SPEC.md — PWA
 * for install + push only, offline is out of scope). Its whole job is to turn a
 * push message from `webPushSender` into a system notification and to focus the
 * app when one is tapped.
 *
 * Payload shape (see `src/notifications/webPushSender.ts`):
 *   { "title": string, "body": string, "url"?: string, "tag"?: string,
 *     "badge"?: number }
 *
 * `badge` is the recipient's unresolved count at send time (issue #134) — this
 * is the only path that can move the app-icon badge while the app is closed,
 * which is the whole point of the feature. `src/app/useAppBadge.ts` re-asserts
 * it from server truth whenever the app is open.
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
    data: { url: payload.url || "/" },
  };
  // Only collapse notifications when the server explicitly tags them (it does
  // not yet). Without a tag each event stacks separately — a decline and a
  // closure must not overwrite each other in the tray.
  if (payload.tag) {
    options.tag = payload.tag;
    options.renotify = true;
  }

  event.waitUntil(
    Promise.all([self.registration.showNotification(title, options), applyAppBadge(payload.badge)]),
  );
});

/**
 * Mirror the payload's unresolved count onto the app icon (issue #134).
 *
 * Shares its clear-at-zero / floor-to-integer half with `badgeUpdateFor` in
 * `src/app/appBadge.ts` — this file is static, outside the bundle, and cannot
 * import it — so keep that half in step. The junk-input half is deliberately
 * different: an absent or non-numeric `badge` means the server sent no count
 * (it omits the key when the read failed), so leave the icon exactly as it was.
 * Wiping a good badge because one payload lacked a number would be worse.
 *
 * Best-effort: Android Chrome has no Badging API, and iOS rejects without
 * notification permission. Both are a silent no-op.
 */
function applyAppBadge(badge) {
  if (typeof badge !== "number" || !Number.isFinite(badge)) return Promise.resolve();
  if (!("setAppBadge" in self.navigator)) return Promise.resolve();

  const applied =
    badge < 1 ? self.navigator.clearAppBadge() : self.navigator.setAppBadge(Math.floor(badge));
  return Promise.resolve(applied).catch(() => {});
}

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
