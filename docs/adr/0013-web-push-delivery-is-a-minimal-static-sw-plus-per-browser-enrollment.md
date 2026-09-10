# Web push delivery is a minimal static service worker plus opt-in per-browser enrollment

Issue #55 shipped the server side of notifications — the `Notifier`, the Resend
and `web-push` adapters, coalescing, the at-risk cron — but left web push inert:
nothing registered a `PushSubscription`, so `webPushSender` had no endpoints and
email carried every notification. Issue #90 is the client half: the service
worker, the PWA manifest, subscription enrollment, and the iOS onboarding
SPEC.md calls for.

**The service worker is a hand-written static file, not a generated bundle.**
`public/sw.js` does two things: turn a `push` message into `showNotification`,
and focus (or open) the app on `notificationclick`. No precache, no offline
route, no Workbox / Serwist — offline is explicitly out of scope (SPEC.md), and
a caching service worker is a well-known source of "why am I seeing the old
build" bugs. It is served with `Cache-Control: no-cache` (a `headers()` entry in
`next.config.ts`) and registered once from the root layout
(`ServiceWorkerRegistrar`) so a push is delivered even when the app isn't open.

**Icons are code-generated route handlers, not committed PNGs.** `app/appIcon.tsx`
renders the mark with `ImageResponse`; `app/icon-192.png` / `app/icon-512.png`
(manifest, Android) and `app/apple-icon.tsx` (iOS Home Screen) are three thin
callers. The mark is a plain ring drawn with `background` / `borderRadius` — the
subset Satori renders reliably — and its two colours are hand-copied from the
design tokens (`--blue-500`, `--sand-50`). This keeps binary assets out of the
tree and the icon in one place; the cost is that a token colour change must be
mirrored here by hand.

**Enrollment is opt-in, per-browser, and only offered from `/settings`.** The
push card there is the single entry point: it runs the `Notification` permission
prompt and `pushManager.subscribe` on demand, never on first load — an
unprompted permission dialog is a dark pattern and browsers increasingly punish
it. Each browser stores its own `push_subscriptions` row; the card lists a
member's registered browsers so a stale one can be dropped. To make that list
legible we added a nullable `user_agent` column (migration `0008`) — the mirror
of what `sessions` carries for the signed-in-devices list.

**iOS gets onboarding instead of a dead button.** On iOS 16.4+ web push only
works once the app is installed to the Home Screen, and there is no
`beforeinstallprompt` on Safari. When the card detects iOS (or desktop-UA
iPadOS, via touch points) and the app is not already `display-mode: standalone`,
it shows the Share → "Add to Home Screen" steps in place of the enable button.

**Consequences.** `POST` / `DELETE /api/push/subscribe` is a new thin adapter
(ADR-0005) — the Playwright smoke path covers its wiring; only the pure helpers
(`urlBase64ToUint8Array`, the iOS detection) are unit-tested. `webPushSender`
already drops a subscription on `404`/`410`, so no server change was needed to
wire delivery end-to-end — it just has endpoints now. Rotating the VAPID keypair
still invalidates every stored subscription (documented in
`docs/notifications.md`). A deep-linking push (open the app to a specific day)
is a later refinement: the SW already reads `data.url`, but the server payload
sends none yet, so every notification opens `/`.
