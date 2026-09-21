import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAllowlistedEmails, getAuthBaseURL, requireEnv, requireGmailConfig } from "./env";

/**
 * `requireEnv` reads `process.env` directly, so every test below snapshots
 * and restores the relevant keys — no `vi.stubEnv` here since these are
 * plain module-level reads, not something Vitest's env stubbing targets
 * specially, and restoring by hand keeps this file dependency-free.
 */
const ENV_KEYS = [
  "ALLOWED_MEMBER_A_EMAIL",
  "ALLOWED_MEMBER_B_EMAIL",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
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

describe("requireGmailConfig", () => {
  it("reads user + app password when both are set", () => {
    process.env.GMAIL_USER = "parent@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "abcdefghijklmnop";

    expect(requireGmailConfig()).toEqual({
      user: "parent@gmail.com",
      appPassword: "abcdefghijklmnop",
    });
  });

  it("strips internal whitespace from the app password (Google's UI groups it in 4-char blocks)", () => {
    process.env.GMAIL_USER = "parent@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";

    expect(requireGmailConfig()).toEqual({
      user: "parent@gmail.com",
      appPassword: "abcdefghijklmnop",
    });
  });

  it("trims GMAIL_USER, matching notifications' reader of the same var", () => {
    process.env.GMAIL_USER = "  parent@gmail.com\n";
    process.env.GMAIL_APP_PASSWORD = "abcdefghijklmnop";

    expect(requireGmailConfig()).toEqual({
      user: "parent@gmail.com",
      appPassword: "abcdefghijklmnop",
    });
  });

  it("throws when GMAIL_USER is missing", () => {
    process.env.GMAIL_APP_PASSWORD = "abcdefghijklmnop";

    expect(() => requireGmailConfig()).toThrow("Missing required environment variable: GMAIL_USER");
  });

  it("throws when GMAIL_APP_PASSWORD is missing", () => {
    process.env.GMAIL_USER = "parent@gmail.com";

    expect(() => requireGmailConfig()).toThrow(
      "Missing required environment variable: GMAIL_APP_PASSWORD",
    );
  });

  it("throws when GMAIL_USER is whitespace-only — truthy pre-trim, empty post-trim", () => {
    // `requireEnv` only rejects a falsy raw value; a whitespace-only string is
    // truthy and sails past it, then trims down to "". Without an explicit
    // post-trim check this would silently hand back an empty `user` instead
    // of failing at module load — the one thing this function exists to
    // prevent (auth has no no-op mailer to degrade into).
    process.env.GMAIL_USER = "   ";
    process.env.GMAIL_APP_PASSWORD = "abcdefghijklmnop";

    expect(() => requireGmailConfig()).toThrow(/GMAIL_USER.*must not be blank/i);
  });

  it("throws when GMAIL_APP_PASSWORD is whitespace-only — truthy pre-strip, empty post-strip", () => {
    process.env.GMAIL_USER = "parent@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "    ";

    expect(() => requireGmailConfig()).toThrow(/GMAIL_APP_PASSWORD.*must not be blank/i);
  });

  it("throws when both are missing — auth has no no-op mailer path", () => {
    expect(() => requireGmailConfig()).toThrow("Missing required environment variable: GMAIL_USER");
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

describe("getAuthBaseURL", () => {
  const PROD = "https://whocares.example";

  it("is the static BETTER_AUTH_URL outside a Vercel preview", () => {
    expect(getAuthBaseURL({ BETTER_AUTH_URL: PROD })).toBe(PROD);
    expect(getAuthBaseURL({ BETTER_AUTH_URL: PROD, VERCEL_ENV: "production" })).toBe(PROD);
    expect(getAuthBaseURL({ BETTER_AUTH_URL: PROD, VERCEL_ENV: "development" })).toBe(PROD);
  });

  it("stays static on production even when Vercel's host vars are present", () => {
    expect(
      getAuthBaseURL({
        BETTER_AUTH_URL: PROD,
        VERCEL_ENV: "production",
        VERCEL_URL: "who-cares-abc123.vercel.app",
        VERCEL_BRANCH_URL: "who-cares-git-main.vercel.app",
      }),
    ).toBe(PROD);
  });

  it("resolves per request on a preview: exactly the deployment's own hosts, prod as fallback", () => {
    expect(
      getAuthBaseURL({
        BETTER_AUTH_URL: PROD,
        VERCEL_ENV: "preview",
        VERCEL_URL: "who-cares-abc123.vercel.app",
        VERCEL_BRANCH_URL: "who-cares-git-feat-x.vercel.app",
      }),
    ).toEqual({
      allowedHosts: ["who-cares-abc123.vercel.app", "who-cares-git-feat-x.vercel.app"],
      protocol: "https",
      fallback: PROD,
    });
  });

  it("drops a missing or blank host var rather than allowing an empty pattern", () => {
    expect(
      getAuthBaseURL({
        BETTER_AUTH_URL: PROD,
        VERCEL_ENV: "preview",
        VERCEL_URL: " who-cares-abc123.vercel.app ",
        VERCEL_BRANCH_URL: "",
      }),
    ).toEqual({
      allowedHosts: ["who-cares-abc123.vercel.app"],
      protocol: "https",
      fallback: PROD,
    });
  });

  it("falls back to the static URL on a preview with no host vars at all", () => {
    expect(getAuthBaseURL({ BETTER_AUTH_URL: PROD, VERCEL_ENV: "preview" })).toBe(PROD);
  });

  it("still requires BETTER_AUTH_URL on a preview — it is the fallback", () => {
    expect(() =>
      getAuthBaseURL({ VERCEL_ENV: "preview", VERCEL_URL: "who-cares-abc123.vercel.app" }),
    ).toThrow("Missing required environment variable: BETTER_AUTH_URL");
  });
});
