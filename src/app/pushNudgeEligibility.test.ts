import { describe, expect, it } from "vitest";
import { shouldShowPushNudge } from "./pushNudgeEligibility";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

const base = {
  standalone: true,
  userAgent: IPHONE_UA,
  maxTouchPoints: 5,
  permission: "default" as NotificationPermission | null,
  dismissed: false,
};

describe("shouldShowPushNudge", () => {
  it("shows for an installed iPhone app that has not been asked yet", () => {
    expect(shouldShowPushNudge(base)).toBe(true);
  });

  it("shows for an installed iPad reporting a desktop UA", () => {
    expect(shouldShowPushNudge({ ...base, userAgent: IPAD_DESKTOP_UA })).toBe(true);
  });

  it.each(["granted", "denied", null] as const)("is hidden when permission is %s", (permission) => {
    expect(shouldShowPushNudge({ ...base, permission })).toBe(false);
  });

  it("is hidden outside the installed app (the install prompt comes first)", () => {
    expect(shouldShowPushNudge({ ...base, standalone: false })).toBe(false);
  });

  it("is hidden once dismissed", () => {
    expect(shouldShowPushNudge({ ...base, dismissed: true })).toBe(false);
  });

  it("is hidden off iOS, where the Badging API is not what this nudge is about", () => {
    expect(shouldShowPushNudge({ ...base, userAgent: ANDROID_UA })).toBe(false);
  });
});
