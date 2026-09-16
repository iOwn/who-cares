import { describe, expect, it } from "vitest";
import {
  IDLE_PULL,
  PULL_MAX_PX,
  PULL_THRESHOLD_PX,
  type PullState,
  pullEnd,
  pullMove,
  pullSettle,
  pullStart,
} from "./pullGesture";

const atTop = { scrollTop: 0, inNestedScroller: false };

describe("pullStart", () => {
  it("begins a pull from the top of the page", () => {
    expect(pullStart(IDLE_PULL, atTop)).toEqual<PullState>({ phase: "pulling", distance: 0 });
  });

  it("does nothing when the page is scrolled down", () => {
    expect(pullStart(IDLE_PULL, { ...atTop, scrollTop: 40 })).toBe(IDLE_PULL);
  });

  it("does nothing when the touch lands in a nested scroller (inbox, dialog)", () => {
    expect(pullStart(IDLE_PULL, { ...atTop, inNestedScroller: true })).toBe(IDLE_PULL);
  });

  it("ignores a new touch while a refresh is in flight", () => {
    const refreshing: PullState = { phase: "refreshing", distance: 72 };
    expect(pullStart(refreshing, atTop)).toBe(refreshing);
  });
});

describe("pullMove", () => {
  const pulling = pullStart(IDLE_PULL, atTop);

  it("moves the indicator with resistance — half the finger travel", () => {
    expect(pullMove(pulling, 60)).toEqual<PullState>({ phase: "pulling", distance: 30 });
  });

  it("arms once the finger has travelled twice the threshold", () => {
    expect(pullMove(pulling, PULL_THRESHOLD_PX * 2)).toEqual<PullState>({
      phase: "armed",
      distance: PULL_THRESHOLD_PX,
    });
  });

  it("caps the indicator so a long drag doesn't run off the screen", () => {
    expect(pullMove(pulling, 1_000).distance).toBe(PULL_MAX_PX);
  });

  it("disarms when the finger comes back up short of the threshold", () => {
    const armed = pullMove(pulling, PULL_THRESHOLD_PX * 2);
    expect(pullMove(armed, 20)).toEqual<PullState>({ phase: "pulling", distance: 10 });
  });

  it("drops back to idle when the finger moves above where it started", () => {
    expect(pullMove(pulling, -5)).toBe(IDLE_PULL);
  });

  it("ignores movement while idle or refreshing", () => {
    expect(pullMove(IDLE_PULL, 80)).toBe(IDLE_PULL);
    const refreshing: PullState = { phase: "refreshing", distance: PULL_THRESHOLD_PX };
    expect(pullMove(refreshing, 200)).toBe(refreshing);
  });
});

describe("pullEnd", () => {
  const pulling = pullStart(IDLE_PULL, atTop);

  it("releasing an armed pull starts a refresh, parked at the threshold", () => {
    const armed = pullMove(pulling, PULL_MAX_PX * 2);
    expect(pullEnd(armed)).toEqual<PullState>({ phase: "refreshing", distance: PULL_THRESHOLD_PX });
  });

  it("releasing short of the threshold cancels", () => {
    expect(pullEnd(pullMove(pulling, 30))).toBe(IDLE_PULL);
  });

  it("lifting during a refresh changes nothing", () => {
    const refreshing = pullEnd(pullMove(pulling, PULL_THRESHOLD_PX * 2));
    expect(pullEnd(refreshing)).toBe(refreshing);
  });
});

describe("pullSettle", () => {
  it("returns to idle once the refresh has landed", () => {
    const refreshing: PullState = { phase: "refreshing", distance: PULL_THRESHOLD_PX };
    expect(pullSettle(refreshing)).toBe(IDLE_PULL);
  });

  it("is a no-op in any other phase", () => {
    const pulling = pullStart(IDLE_PULL, atTop);
    expect(pullSettle(pulling)).toBe(pulling);
  });
});
