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
  const startYRef = useRef<number | null>(null);
  const refreshStartedAtRef = useRef(0);

  const update = useCallback((next: PullState) => {
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
        inNestedScroller: isInNestedScroller(event.target),
      });
      if (next !== pullRef.current) startYRef.current = touch.clientY;
      update(next);
    };

    const onTouchMove = (event: TouchEvent) => {
      const startY = startYRef.current;
      const touch = event.touches[0];
      if (startY === null || !touch) return;
      const phase = pullRef.current.phase;
      if (phase !== "pulling" && phase !== "armed") return;
      const next = pullMove(pullRef.current, touch.clientY - startY);
      // Once a pull is live, keep iOS from rubber-banding the page underneath
      // the indicator. Requires the listener to be non-passive (see below).
      if (next.phase !== "idle" && event.cancelable) event.preventDefault();
      update(next);
    };

    const onTouchEnd = () => {
      startYRef.current = null;
      const next = pullEnd(pullRef.current);
      update(next);
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
  }, [router, update]);

  // The refresh transition has landed: settle the indicator and say so — but
  // not before it has been visible long enough to register. A warm route can
  // round-trip in well under 100 ms, and a spinner that blinks reads as "did
  // anything happen?".
  useEffect(() => {
    if (isPending || pullRef.current.phase !== "refreshing") return;
    const remaining = REFRESH_MIN_VISIBLE_MS - (Date.now() - refreshStartedAtRef.current);
    const settle = () => {
      update(pullSettle(pullRef.current));
      announce("Up to date");
    };
    if (remaining <= 0) {
      settle();
      return;
    }
    const timer = setTimeout(settle, remaining);
    return () => clearTimeout(timer);
  }, [isPending, update]);

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
          className={styles.spinner}
          // Before release the static ring turns with the pull — a "how far to
          // go" cue; once refreshing, the CSS rotation takes over.
          style={pull.phase === "refreshing" ? undefined : { rotate: `${progress * 270}deg` }}
        />
      </div>
      {children}
    </>
  );
}

/**
 * Does the touch start inside an element that scrolls on its own (the inbox
 * panel, a dialog body)? Its scroll must stay its own — never a page refresh.
 */
function isInNestedScroller(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return true;
    node = node.parentElement;
  }
  return false;
}
