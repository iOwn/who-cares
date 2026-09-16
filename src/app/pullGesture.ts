/**
 * The pull-to-refresh gesture as a pure state machine (issue #129, ADR-0016).
 *
 * Numbers in, state out — no DOM, no touch events, no React. `PullToRefresh.tsx`
 * feeds it `touchstart` / `touchmove` / `touchend` and renders the result; this
 * module owns *when* a drag becomes a refresh, tested in the `node` project
 * (`pullGesture.test.ts`) per ADR-0005.
 *
 *   idle ──start──▶ pulling ──move past threshold──▶ armed ──end──▶ refreshing
 *     ▲               │                                │                 │
 *     └──end/lift─────┘◀──────move back up─────────────┘◀────settle──────┘
 */

export type PullPhase = "idle" | "pulling" | "armed" | "refreshing";

export interface PullState {
  readonly phase: PullPhase;
  /** How far the indicator is pulled down, in px after resistance. */
  readonly distance: number;
}

export interface PullStartContext {
  /** `document.scrollingElement.scrollTop` at `touchstart`. */
  readonly scrollTop: number;
  /**
   * Whether the touch landed inside an element that scrolls on its own (the
   * inbox panel, a dialog body). Their scroll must never bubble into a page
   * refresh.
   */
  readonly inNestedScroller: boolean;
}

export const IDLE_PULL: PullState = { phase: "idle", distance: 0 };

/** Begin tracking a touch. Only from `idle`, only at the top of the page. */
export function pullStart(state: PullState, context: PullStartContext): PullState {
  if (state.phase !== "idle") return state;
  if (context.scrollTop > 0 || context.inNestedScroller) return state;
  return { phase: "pulling", distance: 0 };
}

/** Indicator travel (px, after resistance) at which releasing triggers a refresh. */
export const PULL_THRESHOLD_PX = 72;
/** Indicator travel never exceeds this, however far the finger goes. */
export const PULL_MAX_PX = 120;
/**
 * Finger travel that counts as "not moving yet". Below it the pull stays live
 * but the indicator does not move — and, crucially, the host does not start
 * cancelling native gestures. A tap or a jittery press never arms anything.
 */
export const PULL_START_SLOP_PX = 8;
/**
 * Finger travel → indicator travel. Half feels like the platform gestures it
 * replaces (iOS / Android both damp the pull) and makes an accidental brush
 * across the top of the calendar much less likely to arm.
 */
const RESISTANCE = 0.5;

/**
 * Track the finger. `deltaY` / `deltaX` are total travel since `touchstart`
 * (down / right positive). Arms / disarms live as the finger crosses the
 * threshold; moving back above the starting point abandons the pull, and so
 * does a drag that is mostly sideways before the indicator has moved — that is
 * a swipe or the start of a pinch, and it must keep its native meaning.
 */
export function pullMove(state: PullState, deltaY: number, deltaX = 0): PullState {
  if (state.phase !== "pulling" && state.phase !== "armed") return state;
  if (deltaY <= 0) return IDLE_PULL;
  if (state.distance === 0 && Math.abs(deltaX) > deltaY) return IDLE_PULL;
  const distance = Math.min(Math.max(deltaY - PULL_START_SLOP_PX, 0) * RESISTANCE, PULL_MAX_PX);
  return { phase: distance >= PULL_THRESHOLD_PX ? "armed" : "pulling", distance };
}

/**
 * The finger lifts. An armed pull becomes a refresh — the indicator parks at
 * the threshold while `router.refresh()` is in flight; anything short of it
 * simply cancels.
 */
export function pullEnd(state: PullState): PullState {
  if (state.phase === "armed") return { phase: "refreshing", distance: PULL_THRESHOLD_PX };
  if (state.phase === "pulling") return IDLE_PULL;
  return state;
}

/** The refresh has landed (the transition is no longer pending). */
export function pullSettle(state: PullState): PullState {
  return state.phase === "refreshing" ? IDLE_PULL : state;
}
