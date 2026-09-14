import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAllowlistedEmails, getMemberPasswords, requireEnv } from "./env";

/**
 * `requireEnv` reads `process.env` directly, so every test below snapshots
 * and restores the relevant keys — no `vi.stubEnv` here since these are
 * plain module-level reads, not something Vitest's env stubbing targets
 * specially, and restoring by hand keeps this file dependency-free.
 */
const ENV_KEYS = [
  "ALLOWED_MEMBER_A_EMAIL",
  "ALLOWED_MEMBER_B_EMAIL",
  "MEMBER_A_PASSWORD",
  "MEMBER_B_PASSWORD",
] as const;

let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
});

describe("getAllowlistedEmails", () => {
  it("reads the slot-ordered tuple from the two split env vars", () => {
    process.env.ALLOWED_MEMBER_A_EMAIL = "parent-a@whocares.invalid";
    process.env.ALLOWED_MEMBER_B_EMAIL = "parent-b@whocares.invalid";

    expect(getAllowlistedEmails()).toEqual([
      "parent-a@whocares.invalid",
      "parent-b@whocares.invalid",
    ]);
  });

  it("trims and lower-cases each email", () => {
    process.env.ALLOWED_MEMBER_A_EMAIL = "  Parent-A@WhoCares.Invalid  ";
    process.env.ALLOWED_MEMBER_B_EMAIL = "Parent-B@WhoCares.Invalid";

    expect(getAllowlistedEmails()).toEqual([
      "parent-a@whocares.invalid",
      "parent-b@whocares.invalid",
    ]);
  });

  it("throws when ALLOWED_MEMBER_A_EMAIL is missing", () => {
    process.env.ALLOWED_MEMBER_B_EMAIL = "parent-b@whocares.invalid";

    expect(() => getAllowlistedEmails()).toThrow(
      "Missing required environment variable: ALLOWED_MEMBER_A_EMAIL",
    );
  });

  it("throws when ALLOWED_MEMBER_B_EMAIL is missing", () => {
    process.env.ALLOWED_MEMBER_A_EMAIL = "parent-a@whocares.invalid";

    expect(() => getAllowlistedEmails()).toThrow(
      "Missing required environment variable: ALLOWED_MEMBER_B_EMAIL",
    );
  });

  it("throws when an email is only whitespace", () => {
    process.env.ALLOWED_MEMBER_A_EMAIL = "   ";
    process.env.ALLOWED_MEMBER_B_EMAIL = "parent-b@whocares.invalid";

    expect(() => getAllowlistedEmails()).toThrow(/must both be non-empty/);
  });
});

describe("getMemberPasswords", () => {
  it("reads the slot-ordered tuple from the two password env vars", () => {
    process.env.MEMBER_A_PASSWORD = "correct-horse-battery-staple-a";
    process.env.MEMBER_B_PASSWORD = "correct-horse-battery-staple-b";

    expect(getMemberPasswords()).toEqual([
      "correct-horse-battery-staple-a",
      "correct-horse-battery-staple-b",
    ]);
  });

  it("does not trim or lower-case passwords", () => {
    process.env.MEMBER_A_PASSWORD = "  Spaced Out Password  ";
    process.env.MEMBER_B_PASSWORD = "AnotherOne";

    expect(getMemberPasswords()).toEqual(["  Spaced Out Password  ", "AnotherOne"]);
  });

  it("throws when MEMBER_A_PASSWORD is missing", () => {
    process.env.MEMBER_B_PASSWORD = "b-password";

    expect(() => getMemberPasswords()).toThrow(
      "Missing required environment variable: MEMBER_A_PASSWORD",
    );
  });

  it("throws when MEMBER_B_PASSWORD is missing", () => {
    process.env.MEMBER_A_PASSWORD = "a-password";

    expect(() => getMemberPasswords()).toThrow(
      "Missing required environment variable: MEMBER_B_PASSWORD",
    );
  });
});

describe("requireEnv", () => {
  it("throws with the var name when missing", () => {
    delete process.env.SOME_UNSET_VAR_FOR_TEST;
    expect(() => requireEnv("SOME_UNSET_VAR_FOR_TEST")).toThrow(
      "Missing required environment variable: SOME_UNSET_VAR_FOR_TEST",
    );
  });

  it("returns the value when present", () => {
    process.env.SOME_SET_VAR_FOR_TEST = "value";
    expect(requireEnv("SOME_SET_VAR_FOR_TEST")).toBe("value");
    delete process.env.SOME_SET_VAR_FOR_TEST;
  });
});
