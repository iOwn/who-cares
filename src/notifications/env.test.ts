/**
 * `getGmailConfig` (issue #112). The one behaviour worth pinning here: Google's
 * UI shows an App Password space-grouped (`abcd efgh ijkl mnop`), and an
 * operator following `scripts/setup-notifications.sh` commonly pastes it
 * verbatim — a password with the internal spaces intact fails Gmail auth on
 * every send, silently (`services.ts` swallows and logs it). `getGmailConfig`
 * strips all whitespace from `GMAIL_APP_PASSWORD`, not just the ends.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getGmailConfig } from "./env";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getGmailConfig", () => {
  it("returns null when both vars are unset", () => {
    expect(getGmailConfig()).toBeNull();
  });

  it("returns null when only one var is set", () => {
    process.env.GMAIL_USER = "parent@gmail.com";
    expect(getGmailConfig()).toBeNull();
  });

  it("returns the config with a space-grouped App Password stripped to one string", () => {
    process.env.GMAIL_USER = "parent@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
    expect(getGmailConfig()).toEqual({
      user: "parent@gmail.com",
      appPassword: "abcdefghijklmnop",
    });
  });

  it("trims surrounding whitespace from the Gmail address", () => {
    process.env.GMAIL_USER = "  parent@gmail.com  ";
    process.env.GMAIL_APP_PASSWORD = "app-password";
    expect(getGmailConfig()?.user).toBe("parent@gmail.com");
  });
});
