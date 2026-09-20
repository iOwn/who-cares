import { describe, expect, it } from "vitest";
import { parseHideWeekends, serializeHideWeekends } from "./calendarPreferences";

describe("parseHideWeekends", () => {
  it("reads the opt-in value", () => {
    expect(parseHideWeekends("1")).toBe(true);
  });

  it.each([undefined, "", "0", "true", "yes", "01", " 1"])(
    "falls back to showing weekends for %p",
    (value) => {
      expect(parseHideWeekends(value)).toBe(false);
    },
  );
});

describe("serializeHideWeekends", () => {
  it("round-trips both preferences", () => {
    expect(parseHideWeekends(serializeHideWeekends(true))).toBe(true);
    expect(parseHideWeekends(serializeHideWeekends(false))).toBe(false);
  });
});
