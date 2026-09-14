#!/usr/bin/env tsx
/**
 * Seed (and heal, and rotate) the two household members' Better Auth
 * credential accounts from env vars — issue #110.
 *
 *   pnpm db:seed
 *   DATABASE_URL='postgres://…' pnpm db:seed
 *
 * This is the `db-migrate.mjs` counterpart for identity instead of schema:
 * same "read config from the environment, print what happened, non-zero exit
 * on failure" shape, but where `db-migrate.mjs` replays SQL files directly,
 * this script goes through the real `auth` instance (`src/auth/config.ts`) —
 * `auth.api.createUser` (the `admin` plugin, issue #110) is what actually
 * creates a user + credential account, using Better Auth's own password
 * hasher (the same one `signIn.email` verifies against) and firing the
 * existing `databaseHooks.user.create.after` hook that materialises the
 * Household/Members/Child rows (`bootstrapHousehold`). Reusing `auth`
 * directly — rather than re-deriving a parallel Better Auth config here — is
 * the whole point: there is exactly one source of truth for the hasher, the
 * hook, and the allowlist gate, and this script exercises it the same way a
 * real sign-up would have. The static source trace behind "createUser fires
 * the bootstrap hook and is reachable without a session when called
 * directly" lives in a research doc that is NOT on this branch —
 * `docs/research/better-auth-seed-hashing.md` on
 * `research/better-auth-seed-hashing` (unmerged); see
 * https://github.com/iOwn/who-cares/blob/research/better-auth-seed-hashing/docs/research/better-auth-seed-hashing.md.
 *
 * Run with `tsx`, not plain `node`, unlike `db-migrate.mjs`: `src/auth/config.ts`
 * (and everything it imports — `@/db`, `@/domain`) is TypeScript using the
 * `@/*` path alias, which plain Node's ESM loader cannot resolve on its own.
 * `tsx` resolves both (native TS + `tsconfig.json` `paths`) without adding a
 * build step. One extra wrinkle worth recording: a *static* top-level
 * `import { x } from "@/domain"` from a plain `.mjs` entry file fails under
 * `tsx` with "does not provide an export named" for names that only reach
 * `@/domain`'s barrel through a chain of `export *` re-exports (Node's ESM
 * static-export analysis of the transpiled chain doesn't see them, even
 * though the values are there at runtime) — confirmed by hand against this
 * repo's actual `src/domain/index.ts` while building this script. This file
 * therefore only imports from `@/auth/config` and `@/auth/env` directly
 * (plain named `export const`/`export function`, no `export *`), and never
 * imports `@/domain` itself — it never needs to; `auth.api.createUser`
 * reaches `bootstrapHousehold` on its own, inside `config.ts`.
 *
 * ## Idempotency: converges to the current env state on every run
 *
 * Per member, in slot order (A, B):
 *
 *   1. No user with that email yet → `auth.api.createUser({ email, password,
 *      name })`. Creates the user AND the credential account in one call,
 *      and fires `databaseHooks.user.create.after`, same as a real sign-up.
 *   2. User exists, no `credential` account (e.g. a prior run crashed between
 *      Better Auth's own non-atomic user-create and credential-link calls —
 *      see §3 of the research doc cited at the top of this file) → hash the
 *      current password and `internalAdapter.linkAccount` it directly. Heals
 *      the partial state without erroring or re-creating the user.
 *   3. User and credential both exist → hash the current password and
 *      `internalAdapter.updatePassword` it — UNCONDITIONALLY, every run, even
 *      if it "looks" unchanged (there is no cheap way to compare a plaintext
 *      env value against a stored hash other than re-hashing, and re-hashing
 *      is cheap). This is what makes "change `MEMBER_A_PASSWORD` and re-run"
 *      the account-recovery mechanism (see SPEC.md "Identity" and ADR-0014):
 *      there is no self-service reset flow, no `setUserPassword` call either
 *      (that admin route needs a real admin session a bare script doesn't
 *      have) — this script converging on every run is the whole mechanism.
 *
 * Case 1 goes through the public `admin.createUser` endpoint (so the
 * bootstrap hook fires); cases 2 and 3 go straight at `auth.$context`'s
 * `internalAdapter` (no public, no-session-required endpoint exists for
 * either — `admin.setUserPassword` is session-gated). All three are
 * safe to run back-to-back with no side effect beyond the one they describe.
 *
 * ## Rotating a member's password (the recovery procedure)
 *
 * 1. Set the new value: `MEMBER_A_PASSWORD` (or `_B_`) in the environment
 *    (Vercel: Project Settings → Environment Variables, Production scope).
 * 2. Re-run `pnpm db:seed` (or trigger the equivalent deploy step) against
 *    that same environment. Case 3 above overwrites the stored hash.
 * 3. Tell that member the new password out of band — there is no in-app
 *    notification of a password change (SPEC.md "Identity").
 *
 * Nothing else needs to change: the user row, the Household/Members/Child
 * rows, and every other credential are untouched by a rotation.
 */

import { auth, db } from "../src/auth/config.ts";
import { getAllowlistedEmails, getMemberPasswords } from "../src/auth/env.ts";

const SLOTS = ["A", "B"];

async function seedMember(ctx, slot, email, password) {
  const label = `Member ${slot} <${email}>`;
  const existing = await ctx.internalAdapter.findUserByEmail(email);

  if (!existing) {
    await auth.api.createUser({ body: { email, password, name: `Member ${slot}` } });
    console.log(`  ${label}: created (new user + credential; household bootstrap hook fired).`);
    return;
  }

  const userId = existing.user.id;
  const credential = await ctx.internalAdapter.findCredentialAccount(userId);
  const hashedPassword = await ctx.password.hash(password);

  if (!credential) {
    await ctx.internalAdapter.linkAccount({
      providerId: "credential",
      accountId: userId,
      password: hashedPassword,
      userId,
    });
    console.log(`  ${label}: healed (user already existed, credential account was missing).`);
    return;
  }

  await ctx.internalAdapter.updatePassword(userId, hashedPassword);
  console.log(`  ${label}: password re-hashed and overwritten to match the current env value.`);
}

try {
  const emails = getAllowlistedEmails();
  const passwords = getMemberPasswords();
  const ctx = await auth.$context;

  console.log("\n  seeding household member credentials…\n");
  for (let i = 0; i < SLOTS.length; i += 1) {
    await seedMember(ctx, SLOTS[i], emails[i], passwords[i]);
  }
  console.log("\n  done.\n");
} catch (err) {
  const message = err?.message || err?.error?.message || String(err);
  console.error(`\n  seed failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  // `db` (a Neon `Pool` under Drizzle) holds an open WebSocket that would
  // otherwise keep the process alive — same reasoning as `db-migrate.mjs`'s
  // `pool.end()`, just reached through `config.ts`'s own `db` export instead
  // of a pool this script constructs itself.
  await db.$client.end().catch(() => {});
}
