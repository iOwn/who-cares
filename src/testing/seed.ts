/**
 * `seed(db, graph)` — put a fixture household into a real database.
 *
 * Deliberately **raw `INSERT`s** against the migration-defined schema, not calls
 * through the repository interfaces (`docs/testing.md`, "Test data / fixtures").
 * The repositories are the code under test in the integration tier; seeding
 * through them would let a broken query hide behind itself.
 *
 * Everything goes in one transaction, because the household invariant is
 * enforced by `DEFERRABLE INITIALLY DEFERRED` constraint triggers that only fire
 * at `COMMIT` (migration `0001`). A partial graph therefore fails loudly here
 * rather than leaving a half-built household behind.
 *
 * ## Growing with the schema
 *
 * `HouseholdGraph` describes the whole domain; `seed()` persists whatever has a
 * table and reports the rest in `SeedReport.skipped`. Each migration that adds a
 * table extends this function and shrinks that list; `seed.test.ts` pins the
 * current contents, so the list cannot quietly go stale. As of `0003` the
 * childcare `pattern` and `closures` persist; absences / pickup requests /
 * assignments are still unpersisted.
 */

import type { Database } from "@/db";
import type { HouseholdGraph } from "./factories";

/** Entity kinds `HouseholdGraph` can carry that have no table yet. */
export type UnpersistedKind = "absences" | "pickupRequests" | "assignments";

export interface SeedReport {
  /** Rows actually written, per table. */
  readonly inserted: {
    readonly households: number;
    readonly members: number;
    readonly children: number;
    readonly childcarePatternVersions: number;
    readonly closures: number;
  };
  /**
   * Entity kinds present in the graph that this schema cannot store yet, in
   * `HouseholdGraph` declaration order.
   */
  readonly skipped: readonly UnpersistedKind[];
}

const INSERT_HOUSEHOLD = `INSERT INTO households (id, name) VALUES ($1, $2)`;
const INSERT_MEMBER = `INSERT INTO members (id, household_id, slot, name, email) VALUES ($1, $2, $3, $4, $5)`;
const INSERT_CHILD = `INSERT INTO children (id, household_id, name) VALUES ($1, $2, $3)`;
const INSERT_PATTERN_VERSION = `INSERT INTO childcare_pattern_versions (id, household_id, weekdays, effective_from) VALUES ($1, $2, $3, $4)`;
const INSERT_CLOSURE = `INSERT INTO closures (id, household_id, date, reason) VALUES ($1, $2, $3, $4)`;

export async function seed(db: Database, graph: HouseholdGraph): Promise<SeedReport> {
  const { household, members, child, pattern, closures } = graph;

  await db.$client.transaction(async (tx) => {
    await tx.query(INSERT_HOUSEHOLD, [household.id, household.name]);
    // Slot is the member's index in `Household.memberIds`, 1-based — the one
    // place the tuple order becomes a stored column.
    for (const [index, member] of members.entries()) {
      await tx.query(INSERT_MEMBER, [
        member.id,
        member.householdId,
        index + 1,
        member.name,
        member.email,
      ]);
    }
    await tx.query(INSERT_CHILD, [child.id, child.householdId, child.name]);

    for (const version of pattern.versions) {
      await tx.query(INSERT_PATTERN_VERSION, [
        `${pattern.householdId}:${version.effectiveFrom}`,
        household.id,
        // pg encodes a JS array as a Postgres `text[]` literal.
        version.weekdays as unknown as string[],
        version.effectiveFrom,
      ]);
    }

    for (const closure of closures) {
      await tx.query(INSERT_CLOSURE, [
        closure.id,
        closure.householdId,
        closure.date,
        closure.reason ?? null,
      ]);
    }
  });

  const skipped: UnpersistedKind[] = [];
  if (graph.absences.length > 0) skipped.push("absences");
  if (graph.pickupRequests.length > 0) skipped.push("pickupRequests");
  if (graph.assignments.length > 0) skipped.push("assignments");

  return {
    inserted: {
      households: 1,
      members: members.length,
      children: 1,
      childcarePatternVersions: pattern.versions.length,
      closures: closures.length,
    },
    skipped,
  };
}

/**
 * Empty every table the migrations define, for a `beforeEach` that reuses one
 * PGlite instance across the tests in a file. `TRUNCATE` fires no row triggers,
 * so the household constraint triggers do not object to the tables emptying.
 */
export async function truncateAll(db: Database): Promise<void> {
  await db.$client.exec(
    `TRUNCATE households, members, children, childcare_pattern_versions, closures RESTART IDENTITY CASCADE`,
  );
}
