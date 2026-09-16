import { describe, expect, it } from "vitest";
import { RESUME_REFRESH_MIN_INTERVAL_MS, shouldRefreshOnResume } from "./refreshPolicy";

const T0 = 1_700_000_000_000;

describe("shouldRefreshOnResume", () => {
  it("refreshes on the first resume after load", () => {
    expect(shouldRefreshOnResume(null, T0)).toBe(true);
  });

  it("skips a resume that follows another refresh too closely", () => {
    expect(shouldRefreshOnResume(T0, T0 + RESUME_REFRESH_MIN_INTERVAL_MS - 1)).toBe(false);
  });

  it("refreshes once the minimum interval has elapsed", () => {
    expect(shouldRefreshOnResume(T0, T0 + RESUME_REFRESH_MIN_INTERVAL_MS)).toBe(true);
  });
});
