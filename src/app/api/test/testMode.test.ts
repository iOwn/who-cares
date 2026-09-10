import { describe, expect, it } from "vitest";
import { assertTestModeEnabled, isTestModeEnabled, TestModeDisabledError } from "./testMode";

describe("isTestModeEnabled", () => {
  it("is off when E2E_TEST_MODE is unset", () => {
    expect(isTestModeEnabled({})).toBe(false);
  });

  it("is off for empty / falsy-looking values", () => {
    for (const value of ["", "0", "false", "off", "no", " "]) {
      expect(isTestModeEnabled({ E2E_TEST_MODE: value })).toBe(false);
    }
  });

  it("is on for the accepted truthy spellings, case- and space-insensitively", () => {
    for (const value of ["1", "true", "on", "yes", " TRUE ", "On"]) {
      expect(isTestModeEnabled({ E2E_TEST_MODE: value })).toBe(true);
    }
  });

  it("stays off on Vercel production even when E2E_TEST_MODE is set", () => {
    expect(isTestModeEnabled({ E2E_TEST_MODE: "1", VERCEL_ENV: "production" })).toBe(false);
  });

  it("allows the preview environment", () => {
    expect(isTestModeEnabled({ E2E_TEST_MODE: "1", VERCEL_ENV: "preview" })).toBe(true);
  });
});

describe("assertTestModeEnabled", () => {
  it("throws TestModeDisabledError when off", () => {
    expect(() => assertTestModeEnabled({})).toThrow(TestModeDisabledError);
  });

  it("is a no-op when on", () => {
    expect(() => assertTestModeEnabled({ E2E_TEST_MODE: "1" })).not.toThrow();
  });
});
