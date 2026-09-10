import { describe, expect, it } from "vitest";
import { installPromptState } from "./installEligibility";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const base = {
  standalone: false,
  userAgent: ANDROID_CHROME_UA,
  maxTouchPoints: 5,
  canPrompt: false,
  dismissed: false,
};

describe("installPromptState", () => {
  it("is hidden once the app runs standalone", () => {
    expect(installPromptState({ ...base, standalone: true, canPrompt: true })).toBe("hidden");
  });

  it("is hidden once the parent has dismissed it", () => {
    expect(installPromptState({ ...base, dismissed: true, canPrompt: true })).toBe("hidden");
  });

  it("shows the native prompt when a beforeinstallprompt event is in hand", () => {
    expect(installPromptState({ ...base, canPrompt: true })).toBe("prompt");
  });

  it("shows iOS guidance on an iPhone (no beforeinstallprompt there)", () => {
    expect(installPromptState({ ...base, userAgent: IPHONE_UA, canPrompt: false })).toBe(
      "ios-guidance",
    );
  });

  it("shows iOS guidance on iPadOS reporting a desktop Safari UA", () => {
    expect(
      installPromptState({
        ...base,
        userAgent: IPAD_DESKTOP_UA,
        maxTouchPoints: 5,
        canPrompt: false,
      }),
    ).toBe("ios-guidance");
  });

  it("stays hidden on a desktop browser that fired no beforeinstallprompt", () => {
    expect(
      installPromptState({
        ...base,
        userAgent: DESKTOP_CHROME_UA,
        maxTouchPoints: 0,
        canPrompt: false,
      }),
    ).toBe("hidden");
  });

  it("prefers the real prompt over iOS guidance if somehow both apply", () => {
    expect(installPromptState({ ...base, userAgent: IPHONE_UA, canPrompt: true })).toBe("prompt");
  });
});
