"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { announce, Spinner } from "@/ui";
import styles from "./PullToRefresh.module.css";
import {
  IDLE_PULL,
  PULL_THRESHOLD_PX,
  type PullState,
  pullEnd,
  pullMove,
  pullSettle,
  pullStart,
} from "./pullGesture";

/** Floor on how long the spinning indicator stays up once the finger lifts. */
const REFRESH_MIN_VISIBLE_MS = 400;

/**
 * Pull-to-refresh for the installed app (issue #129, ADR-0016).
 *
 * `display: standalone` hides the browser's reload control, so touch users get
 * the gesture they expect instead: drag down from the top of the page, release
 * past a threshold, and the route re-fetches via `router.refresh()`. The gesture
 * rules live in the pure `pullGesture.ts` state machine; this component only
 * wires touch events to it and renders the indicator.
 *
 * Touch-only by construction (touch events never fire for a mouse); desktop
 * users keep their reload button and `RefreshOnResume` covers them anyway.
 *
 * The page content is deliberately **not** translated during the pull. A
 * `transform` on the wrapper would turn the fixed inbox panel and the sticky
 * headers into transform-relative boxes. Instead a fixed indicator pill drops
 * in from under the top edge and fades up as the pull approaches the threshold.
 *
 * `globals.css` sets `overscroll-behavior-y: none` so Chrome Android's native
 * pull-to-reload doesn't fire alongside this one in browser mode.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pull, setPull] = useState<PullState>(IDLE_PULL);
  // The machine state and the finger's start Y, read synchronously inside the
  // native listeners (React state would be a render behind).
  const pullRef = useRef<PullState>(IDLE_PULL);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const refreshStartedAtRef = useRef(0);

  const commitPull = useCallback((next: PullState) => {
    if (next === pullRef.current) return;
    pullRef.current = next;
    setPull(next);
  }, []);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length > 1) return;
      const next = pullStart(pullRef.current, {
        scrollTop: document.scrollingElement?.scrollTop ?? 0,
        inNestedScroller: isInOverlayOrScroller(event.target),
      });
      if (next !== pullRef.current) startRef.current = { x: touch.clientX, y: touch.clientY };
      commitPull(next);
    };

    const onTouchMove = (event: TouchEvent) => {
      const start = startRef.current;
      const touch = event.touches[0];
      if (!start || !touch) return;
      const phase = pullRef.current.phase;
      if (phase !== "pulling" && phase !== "armed") return;
      // A second finger means a pinch, never a pull. Hand the gesture back to
      // the browser untouched — pinch-zoom is a WCAG 1.4.4 guarantee (layout.tsx).
      if (event.touches.length > 1) {
        startRef.current = null;
        commitPull(IDLE_PULL);
        return;
      }
      const next = pullMove(pullRef.current, touch.clientY - start.y, touch.clientX - start.x);
      // Once the indicator is actually moving, keep iOS from rubber-banding the
      // page underneath it. Requires the non-passive listener registered below.
      // Before that (inside the start slop) the browser keeps the event.
      if (next.distance > 0 && event.cancelable) event.preventDefault();
      commitPull(next);
    };

    const onTouchEnd = () => {
      startRef.current = null;
      const next = pullEnd(pullRef.current);
      commitPull(next);
      if (next.phase === "refreshing") {
        refreshStartedAtRef.current = Date.now();
        announce("Refreshing…");
        startTransition(() => router.refresh());
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [router, commitPull]);

  // The refresh transition has landed: settle the indicator and say so — but
  // not before it has been visible long enough to register. A warm route can
  // round-trip in well under 100 ms, and a spinner that blinks reads as "did
  // anything happen?".
  // Keyed on `pull.phase` as well as `isPending` so that, should a refresh ever
  // complete without the transition flagging pending, the indicator still
  // settles instead of parking in `refreshing` and blocking the next pull.
  useEffect(() => {
    if (isPending || pull.phase !== "refreshing") return;
    const remaining = REFRESH_MIN_VISIBLE_MS - (Date.now() - refreshStartedAtRef.current);
    const settle = () => {
      commitPull(pullSettle(pullRef.current));
      announce("Up to date");
    };
    if (remaining <= 0) {
      settle();
      return;
    }
    const timer = setTimeout(settle, remaining);
    return () => clearTimeout(timer);
  }, [isPending, pull.phase, commitPull]);

  const progress = Math.min(pull.distance / PULL_THRESHOLD_PX, 1);
  const visible = pull.phase !== "idle";

  return (
    <>
      <div
        className={styles.indicator}
        data-phase={pull.phase}
        aria-hidden={!visible}
        style={{
          transform: `translate(-50%, ${visible ? pull.distance : 0}px)`,
          opacity: visible ? progress : 0,
        }}
      >
        <Spinner
          size="sm"
          label=""
          // Before release the frozen ring turns with the pull — a "how far to
          // go" cue; once refreshing, the spinner's own rotation takes over.
          isSpinning={pull.phase === "refreshing"}
          style={pull.phase === "refreshing" ? undefined : { rotate: `${progress * 270}deg` }}
        />
      </div>
      {children}
    </>
  );
}

/**
 * Does the touch start inside something that is not the page itself — an
 * element that scrolls on its own (a dialog body) or a fixed overlay (the inbox
 * panel, a sheet, its scrim)? A drag there must stay what it is: scrolling that
 * element, or nothing. A refresh under a scrim would run invisibly, and the
 * inbox / a sheet keep their own state, so they get no gesture of their own —
 * a parent closes them to pull, and resume-refresh covers the rest.
 */
function isInOverlayOrScroller(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    if (style.overflowY === "auto" || style.overflowY === "scroll") return true;
    if (style.position === "fixed") return true;
    node = node.parentElement;
  }
  return false;
}
