import { describe, expect, it } from "vitest";
import { describeUserAgent, formatLastActive } from "./deviceInfo";

describe("describeUserAgent", () => {
  it("names browser and OS for common desktop agents", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on macOS");

    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
      ),
    ).toBe("Firefox on Windows");
  });

  it("recognises mobile Safari and Chrome on iOS", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iPhone");

    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Chrome on iPhone");
  });

  it("picks Edge over Chrome when both tokens are present", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
      ),
    ).toBe("Edge on Windows");
  });

  it("falls back cleanly on missing or unrecognised agents", () => {
    expect(describeUserAgent(null)).toBe("Unknown device");
    expect(describeUserAgent(undefined)).toBe("Unknown device");
    expect(describeUserAgent("   ")).toBe("Unknown device");
    expect(describeUserAgent("curl/8.4.0")).toBe("Unknown device");
  });
});

describe("formatLastActive", () => {
  const now = new Date("2026-09-09T12:00:00Z");

  it("reads recent activity in the largest whole unit", () => {
    expect(formatLastActive(new Date("2026-09-09T11:59:30Z"), now)).toBe("Just now");
    expect(formatLastActive(new Date("2026-09-09T11:59:00Z"), now)).toBe("1 minute ago");
    expect(formatLastActive(new Date("2026-09-09T11:45:00Z"), now)).toBe("15 minutes ago");
    expect(formatLastActive(new Date("2026-09-09T09:00:00Z"), now)).toBe("3 hours ago");
    expect(formatLastActive(new Date("2026-09-07T12:00:00Z"), now)).toBe("2 days ago");
  });

  it("switches to an absolute date past a week", () => {
    expect(formatLastActive(new Date("2026-08-20T12:00:00Z"), now)).toBe("on 20 Aug 2026");
  });

  it("treats a future timestamp as just now", () => {
    expect(formatLastActive(new Date("2026-09-09T12:05:00Z"), now)).toBe("Just now");
  });
});
