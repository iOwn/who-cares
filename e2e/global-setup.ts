import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type FullConfig, request } from "playwright/test";
import { vercelBypassHeaders } from "./vercel-bypass";

/**
 * Global setup for the one E2E smoke path (ADR-0008, issue #56).
 *
 * Drives the `E2E_TEST_MODE`-gated test seam on the target deployment:
 *
 *   POST {baseURL}/api/test/seed   — truncate-all + re-insert the fixed household
 *   POST {baseURL}/api/test/login  — mint a Better Auth session for a named member
 *
 * then persists one `storageState` per parent so the spec can act as each in
 * turn (parent A declares the absence; parent B accepts the request). The
 * magic-link *email* path is deliberately not smoke-covered — the login seam
 * runs the same server code magic-link verification does (ADR-0008).
 *
 * A no-op when `PLAYWRIGHT_BASE_URL` is unset so `playwright test --list` still
 * loads; the spec itself skips in that case.
 *
 * Both `APIRequestContext`s below carry `vercelBypassHeaders()` (issue #99) so
 * they clear Vercel Authentication on the preview deploy — Playwright's test
 * runner separately merges the same headers into every browser/API context
 * created inside a test (including `smoke.spec.ts`'s parent-B context), via
 * `playwright.config.ts`'s `use.extraHTTPHeaders`; these two contexts are the
 * one place that runs outside a test (global setup), so they need it spelled
 * out explicitly. `x-vercel-set-bypass-cookie` is sent alongside the header as
 * the belt-and-suspenders combination Vercel's own docs recommend, covering
 * any request that ends up outside Playwright's header injection.
 */

const AUTH_DIR = path.join(process.cwd(), "e2e", ".auth");
export const STORAGE_STATE = {
  a: path.join(AUTH_DIR, "parentA.json"),
  b: path.join(AUTH_DIR, "parentB.json"),
} as const;

/**
 * A bare 401 from the test seam is ambiguous: the app itself 404s when
 * `E2E_TEST_MODE` isn't set, so a 401 here is Vercel Authentication rejecting
 * the request before it ever reaches the app (issue #99) — most likely
 * `VERCEL_AUTOMATION_BYPASS_SECRET` is unset, wrong, or expired. Spell that
 * out rather than let the failure read as an `E2E_TEST_MODE` problem.
 */
function explainStatus(status: number): string {
  return status === 401
    ? " (401 this early means Vercel Authentication rejected the request, not the app — check VERCEL_AUTOMATION_BYPASS_SECRET.)"
    : "";
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) return;

  await mkdir(AUTH_DIR, { recursive: true });
  const extraHTTPHeaders = vercelBypassHeaders();

  const seeder = await request.newContext({ baseURL, extraHTTPHeaders });
  const seed = await seeder.post("/api/test/seed");
  if (!seed.ok()) {
    throw new Error(
      `POST /api/test/seed failed (${seed.status()}).${explainStatus(seed.status())} Is E2E_TEST_MODE set on ${baseURL}? Body: ${await seed.text()}`,
    );
  }
  await seeder.dispose();

  // Independent per-member flows — each logs in and writes its own
  // STORAGE_STATE path — so run them concurrently rather than serially.
  await Promise.all(
    (["a", "b"] as const).map(async (member) => {
      const ctx = await request.newContext({ baseURL, extraHTTPHeaders });
      const login = await ctx.post("/api/test/login", { data: { member } });
      if (!login.ok()) {
        throw new Error(
          `POST /api/test/login {member:"${member}"} failed (${login.status()}).${explainStatus(login.status())} Body: ${await login.text()}`,
        );
      }
      await ctx.storageState({ path: STORAGE_STATE[member] });
      await ctx.dispose();
    }),
  );
}
