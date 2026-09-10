import { describe, expect, it } from "vitest";
import { isIOS, needsIOSInstall, urlBase64ToUint8Array } from "./pushSupport";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

describe("urlBase64ToUint8Array", () => {
  it("round-trips a URL-safe base64 VAPID key to the expected bytes", () => {
    // "hello" with a URL-safe alphabet + no padding.
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8"))).toEqual([104, 101, 108, 108, 111]);
  });

  it("restores `-`/`_` to `+`/`/` and re-pads before decoding", () => {
    expect(Array.from(urlBase64ToUint8Array("-_"))).toEqual([251]); // "+/" -> 0xFB
    expect(Array.from(urlBase64ToUint8Array("_-"))).toEqual([255]); // "/+" -> 0xFF
  });

  it("is backed by a plain ArrayBuffer (so it satisfies BufferSource)", () => {
    expect(urlBase64ToUint8Array("aGVsbG8").buffer).toBeInstanceOf(ArrayBuffer);
  });
});

describe("isIOS", () => {
  it("is true for an iPhone UA and false for a Mac", () => {
    expect(isIOS(IPHONE_UA)).toBe(true);
    expect(isIOS(MAC_UA)).toBe(false);
  });
});

describe("needsIOSInstall", () => {
  it("prompts on an iPhone that is not yet a standalone app", () => {
    expect(needsIOSInstall({ userAgent: IPHONE_UA, maxTouchPoints: 5, standalone: false })).toBe(
      true,
    );
  });

  it("stays quiet once the app runs standalone", () => {
    expect(needsIOSInstall({ userAgent: IPHONE_UA, maxTouchPoints: 5, standalone: true })).toBe(
      false,
    );
  });

  it("catches desktop-UA iPadOS via touch points", () => {
    expect(
      needsIOSInstall({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5, standalone: false }),
    ).toBe(true);
  });

  it("does not prompt on a real Mac", () => {
    expect(needsIOSInstall({ userAgent: MAC_UA, maxTouchPoints: 0, standalone: false })).toBe(
      false,
    );
  });
});
