import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type FullConfig, request } from "playwright/test";

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
 */

const AUTH_DIR = path.join(process.cwd(), "e2e", ".auth");
export const STORAGE_STATE = {
  a: path.join(AUTH_DIR, "parentA.json"),
  b: path.join(AUTH_DIR, "parentB.json"),
} as const;

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) return;

  await mkdir(AUTH_DIR, { recursive: true });

  const seeder = await request.newContext({ baseURL });
  const seed = await seeder.post("/api/test/seed");
  if (!seed.ok()) {
    throw new Error(
      `POST /api/test/seed failed (${seed.status()}). Is E2E_TEST_MODE set on ${baseURL}? Body: ${await seed.text()}`,
    );
  }
  await seeder.dispose();

  for (const member of ["a", "b"] as const) {
    const ctx = await request.newContext({ baseURL });
    const login = await ctx.post("/api/test/login", { data: { member } });
    if (!login.ok()) {
      throw new Error(
        `POST /api/test/login {member:"${member}"} failed (${login.status()}): ${await login.text()}`,
      );
    }
    await ctx.storageState({ path: STORAGE_STATE[member] });
    await ctx.dispose();
  }
}
