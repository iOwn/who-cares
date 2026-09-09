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
 * current contents, so the list cannot quietly go stale. As of `0005` the whole
 * graph persists — `skipped` is always empty.
 */

import type { Database } from "@/db";
import type { HouseholdGraph } from "./factories";

/**
 * Entity kinds `HouseholdGraph` can carry that have no table yet. As of
 * migration `0005` every kind persists, so this is `never` — the type and the
 * `skipped` list are kept so a future graph addition has a place to land.
 */
export type UnpersistedKind = never;

export interface SeedReport {
  /** Rows actually written, per table. */
  readonly inserted: {
    readonly households: number;
    readonly members: number;
    readonly children: number;
    readonly childcarePatternVersions: number;
    readonly closures: number;
    readonly absences: number;
    readonly pickupRequests: number;
    readonly assignments: number;
  };
  /**
   * Entity kinds present in the graph that this schema cannot store yet, in
   * `HouseholdGraph` declaration order. Empty since migration `0005`.
   */
  readonly skipped: readonly UnpersistedKind[];
}

const INSERT_HOUSEHOLD = `INSERT INTO households (id, name) VALUES ($1, $2)`;
const INSERT_MEMBER = `INSERT INTO members (id, household_id, slot, name, email) VALUES ($1, $2, $3, $4, $5)`;
const INSERT_CHILD = `INSERT INTO children (id, household_id, name) VALUES ($1, $2, $3)`;
const INSERT_PATTERN_VERSION = `INSERT INTO childcare_pattern_versions (id, household_id, weekdays, effective_from) VALUES ($1, $2, $3, $4)`;
const INSERT_CLOSURE = `INSERT INTO closures (id, household_id, date, reason) VALUES ($1, $2, $3, $4)`;
const INSERT_ABSENCE = `INSERT INTO absences (id, household_id, member_id, start_date, end_date, label, note) VALUES ($1, $2, $3, $4, $5, $6, $7)`;
const INSERT_PICKUP_REQUEST = `INSERT INTO pickup_requests (id, household_id, date, requester_id, recipient_id, absence_id, state, raised_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
const INSERT_ASSIGNMENT = `INSERT INTO assignments (id, household_id, date, assignee_id, source, created_at) VALUES ($1, $2, $3, $4, $5, $6)`;

export async function seed(db: Database, graph: HouseholdGraph): Promise<SeedReport> {
  const { household, members, child, pattern, closures, absences, pickupRequests, assignments } =
    graph;

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

    for (const absence of absences) {
      await tx.query(INSERT_ABSENCE, [
        absence.id,
        absence.householdId,
        absence.memberId,
        absence.startDate,
        absence.endDate,
        absence.label ?? null,
        absence.note ?? null,
      ]);
    }

    for (const request of pickupRequests) {
      await tx.query(INSERT_PICKUP_REQUEST, [
        request.id,
        request.householdId,
        request.date,
        request.requesterId,
        request.recipientId,
        request.absenceId,
        request.state,
        request.raisedAt,
      ]);
    }

    for (const assignment of assignments) {
      await tx.query(INSERT_ASSIGNMENT, [
        assignment.id,
        assignment.householdId,
        assignment.date,
        assignment.assigneeId,
        assignment.source,
        assignment.createdAt,
      ]);
    }
  });

  return {
    inserted: {
      households: 1,
      members: members.length,
      children: 1,
      childcarePatternVersions: pattern.versions.length,
      closures: closures.length,
      absences: absences.length,
      pickupRequests: pickupRequests.length,
      assignments: assignments.length,
    },
    skipped: [],
  };
}

/**
 * Empty every table the migrations define, for a `beforeEach` that reuses one
 * PGlite instance across the tests in a file. `TRUNCATE` fires no row triggers,
 * so the household constraint triggers do not object to the tables emptying.
 */
export async function truncateAll(db: Database): Promise<void> {
  await db.$client.exec(
    `TRUNCATE households, members, children, childcare_pattern_versions, closures,
      absences, pickup_requests, assignments RESTART IDENTITY CASCADE`,
  );
}
