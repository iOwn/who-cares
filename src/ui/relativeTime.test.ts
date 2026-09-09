import { describe, expect, it } from "vitest";
import { requestTimingLine, timeAgo } from "./relativeTime";

const BASE = new Date("2025-01-10T12:00:00.000Z");
const ago = (ms: number) => new Date(BASE.getTime() - ms);

describe("timeAgo", () => {
  it.each([
    [ago(0), "just now"],
    [ago(30 * 1000), "just now"],
    [ago(60 * 1000), "1 minute ago"],
    [ago(5 * 60 * 1000), "5 minutes ago"],
    [ago(60 * 60 * 1000), "1 hour ago"],
    [ago(3 * 60 * 60 * 1000), "3 hours ago"],
    [ago(24 * 60 * 60 * 1000), "1 day ago"],
    [ago(50 * 60 * 60 * 1000), "2 days ago"],
    [new Date(BASE.getTime() + 5000), "just now"],
  ])("%s -> %s", (instant, expected) => {
    expect(timeAgo(instant, BASE)).toBe(expected);
  });
});

describe("requestTimingLine", () => {
  it("reads neutrally before escalation", () => {
    expect(requestTimingLine(ago(3 * 60 * 60 * 1000), BASE, false)).toBe("Asked 3 hours ago.");
  });

  it("states the fact plainly once escalated, still no urgency tone", () => {
    expect(requestTimingLine(ago(3 * 24 * 60 * 60 * 1000), BASE, true)).toBe(
      "Still no answer — asked 3 days ago.",
    );
  });
});
