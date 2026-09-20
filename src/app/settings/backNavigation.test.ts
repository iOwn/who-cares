import { describe, expect, it } from "vitest";
import {
  consumeSettingsOpenedFromApp,
  type MarkerStorage,
  markSettingsOpenedFromApp,
  OPENED_FROM_APP_KEY,
} from "./backNavigation";

function fakeStorage(): MarkerStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function throwingStorage(): MarkerStorage {
  const boom = () => {
    throw new DOMException("QuotaExceededError");
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

describe("Settings back navigation marker", () => {
  it("is not set on a cold visit, so the back arrow pushes home", () => {
    expect(consumeSettingsOpenedFromApp(fakeStorage())).toBe(false);
  });

  it("is consumed exactly once after the app shell sets it", () => {
    const storage = fakeStorage();
    markSettingsOpenedFromApp(storage);
    expect(storage.map.has(OPENED_FROM_APP_KEY)).toBe(true);

    expect(consumeSettingsOpenedFromApp(storage)).toBe(true);
    // A reload or deep link later in the same tab must not inherit it.
    expect(storage.map.has(OPENED_FROM_APP_KEY)).toBe(false);
    expect(consumeSettingsOpenedFromApp(storage)).toBe(false);
  });

  it("falls back to pushing when storage is unavailable", () => {
    expect(() => markSettingsOpenedFromApp(null)).not.toThrow();
    expect(consumeSettingsOpenedFromApp(null)).toBe(false);
  });

  it("falls back to pushing when storage throws", () => {
    expect(() => markSettingsOpenedFromApp(throwingStorage())).not.toThrow();
    expect(consumeSettingsOpenedFromApp(throwingStorage())).toBe(false);
  });
});
