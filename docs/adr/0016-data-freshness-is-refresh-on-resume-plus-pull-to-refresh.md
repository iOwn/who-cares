# Data freshness is `router.refresh()` on resume plus pull-to-refresh — no polling, no realtime

Both authenticated routes (`/`, `/settings`) are Server Components that read the
household on the server and hand a snapshot to a client screen. Nothing
re-fetches while the tab stays open; the only refreshes were the
`router.refresh()` calls that follow a parent's own mutation. That was fine in a
browser tab with a reload button. It is not fine for the installed PWA
(`display: standalone`, ADR-0013): there is no chrome, the tab lives for days,
and a parent reopening it from the Home Screen saw yesterday's requests. Day
state makes this worse — it is derived live against `now` (ADR-0003), so the
48h at-risk threshold can pass while the screen still says "Waiting". Issue #129.

**Freshness comes from two client-side triggers, both ending in `router.refresh()`.**
`RefreshOnResume` fires when the app resumes — `visibilitychange` to visible,
window `focus`, or a bfcache `pageshow` — via the shared `useOnResume` hook
(extracted from `useWallClock`, which needed the same signal for the clock).
`PullToRefresh` is the explicit control on touch: drag down from the top of the
page, release past a threshold. Both are mounted once in the root layout so
every route gets them. `router.refresh()` re-runs the Server Components and
merges the payload without disturbing client state — an open dialog, the inbox,
calendar paging all survive — and the pages are already dynamic (they read the
session cookie), so nothing on the server needs revalidating.

**Resume refreshes are throttled to one per 15 s; the first is never throttled.**
Each refresh re-renders the whole route on the server (six repository reads on
`/`), and desktop `focus` fires on every click back into the window. The
decision is the pure `shouldRefreshOnResume()`; `lastRefreshAt` starts `null`
so a parent reopening the app — the case that motivated this — always gets
fresh data, and the E2E smoke can rely on a single synthetic `focus`.

**Pull-to-refresh moves an indicator, not the page.** The gesture is a pure
state machine (`pullGesture.ts`: idle → pulling → armed → refreshing) fed by
touch events on `document`. The wrapper never applies a `transform` to the page
content: doing so would make the fixed inbox panel and the sticky headers
transform-relative. Instead a fixed pill drops in from under the top edge and
fades up with the pull, parks at the threshold with a spinning `Spinner` while
the transition is pending (and for at least 400 ms, so a warm round-trip does not
read as a blink), then settles. A touch that starts inside a nested scroller
or a fixed overlay (the inbox, a sheet, a dialog body) never begins a pull — a
refresh under a scrim would run invisibly, so those surfaces have no gesture
and a parent closes them to pull. A second finger, or a mostly sideways drag,
hands the gesture straight back to the browser: pinch-zoom is a WCAG 1.4.4
guarantee the layout documents, and
`overscroll-behavior-y: none` on `html`/`body` keeps Chrome Android's native
pull-to-reload from firing alongside ours in browser mode.

**Rejected.** Polling (`setInterval`) — constant load for a household that
changes a few times a week, and still stale for up to an interval on reopen.
Realtime (SSE / WebSockets) — needs an always-on connection the serverless
stack (ADR-0004) does not want to hold, for the same handful of changes. A
caching service worker with background sync — ADR-0013 keeps the worker
cache-free on purpose. A `refresh()` Server Action — a needless round-trip when
the client can ask the router directly.

**Consequences.** Every resume costs one RSC render; the throttle bounds it.
The smoke path (ADR-0008) now dispatches a `focus` event where it used to
`page.reload()`, so it exercises the resume path on every preview deploy — a
regression there fails CI. The gesture and throttle rules are unit-tested in the
`node` project; the touch wiring and the indicator are not (ADR-0005, ADR-0009)
— they are exercised with synthetic touch events in Chrome, and a real-device
pass (iOS Safari standalone, Android Chrome) on the preview deploy is part of
each change's verification. Desktop mouse users get no gesture;
resume-refresh and the browser's reload button cover them.
