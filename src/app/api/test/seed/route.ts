/**
 * `POST /api/test/seed` — the destructive E2E fixture reset (issue #56, ADR-0008).
 *
 * Truncates every table (domain + Better Auth) and re-inserts the fixed smoke
 * household from `buildE2eHouseholdGraph()` with the two `ALLOWED_MEMBER_EMAILS`
 * addresses. Idempotent by construction — truncate-then-insert each call — so
 * Playwright's global setup can run it before every CI run.
 *
 * Mounted only when `E2E_TEST_MODE` is set (the Vercel **preview** deploy, never
 * production): `assertTestModeEnabled()` makes the route return a bare 404
 * otherwise. See `docs/testing.md` "E2E smoke scope".
 *
 * Deliberately NOT `src/testing/seed.ts` — that helper writes through
 * `db.$client.transaction`, which only the PGlite test driver exposes. This runs
 * the same inserts through the driver-agnostic Drizzle query builder against the
 * live Neon handle instead, inside one `db.transaction()` so the household's
 * `DEFERRABLE INITIALLY DEFERRED` graph triggers see the finished graph at
 * COMMIT.
 */

import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/auth/config";
import { getAllowlistedEmails } from "@/auth/env";
import { schema } from "@/db/client";
import { buildE2eHouseholdGraph } from "@/testing/e2eHousehold";
import { assertTestModeEnabled, TestModeDisabledError } from "../testMode";

export const dynamic = "force-dynamic";

/**
 * Every table in the Drizzle schema, derived — not a hand-kept list. `CASCADE`
 * makes order irrelevant; a migration that adds a table is truncated here
 * automatically, so this seam can't silently leave rows behind.
 */
function allTableNames(): string[] {
  const names: string[] = [];
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) names.push(getTableName(value));
  }
  return names;
}

const ALL_TABLES = sql.join(
  allTableNames().map((name) => sql.identifier(name)),
  sql`, `,
);

export async function POST(): Promise<Response> {
  try {
    assertTestModeEnabled();
  } catch (error) {
    if (error instanceof TestModeDisabledError) return new Response(null, { status: 404 });
    throw error;
  }

  const graph = buildE2eHouseholdGraph(getAllowlistedEmails());

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`TRUNCATE ${ALL_TABLES} RESTART IDENTITY CASCADE`);

      await tx.insert(schema.households).values({
        id: graph.household.id,
        name: graph.household.name,
      });
      await tx.insert(schema.members).values(
        graph.members.map((member, index) => ({
          id: member.id,
          householdId: member.householdId,
          slot: index + 1,
          name: member.name,
          email: member.email,
        })),
      );
      await tx.insert(schema.children).values({
        id: graph.child.id,
        householdId: graph.child.householdId,
        name: graph.child.name,
      });
      await tx.insert(schema.childcarePatternVersions).values(
        graph.pattern.versions.map((version) => ({
          id: `${graph.pattern.householdId}:${version.effectiveFrom}`,
          householdId: graph.household.id,
          weekdays: [...version.weekdays],
          effectiveFrom: version.effectiveFrom,
        })),
      );
    });
  } catch (error) {
    console.error("POST /api/test/seed failed", error);
    return Response.json({ error: "seed failed" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    household: graph.household.id,
    members: graph.members.map((m) => ({ id: m.id, email: m.email, name: m.name })),
  });
}
