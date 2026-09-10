/**
 * The E2E smoke-path seed payload (issue #56, ADR-0008, `docs/testing.md`
 * "E2E seed payload").
 *
 * `POST /api/test/seed` wipes the database and re-inserts exactly this graph:
 * `makeTypicalHousehold()` — 2 members, 1 child, a Mon–Fri pattern from the
 * anchor, no closures / absences / requests / assignments — with the two
 * deploy-configured test-account emails (`ALLOWED_MEMBER_EMAILS`) injected so a
 * Better Auth session minted for one of them resolves to a `Member`
 * (`getCurrentSession`).
 *
 * A pure builder, kept here beside the factories rather than in the route so it
 * is unit-testable without pulling Next into the test (and without the route
 * pulling PGlite via `@/testing`'s barrel — the route imports this module
 * directly).
 */

import {
  type HouseholdGraph,
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeMember,
  makeTypicalHousehold,
} from "./factories";

/** The two member display names the smoke spec asserts against, slot order. */
export const E2E_MEMBER_NAMES = ["Alex", "Bailey"] as const;

/** `"a"` → slot 1, `"b"` → slot 2. The login route's `member` argument. */
export type E2eMemberKey = "a" | "b";

/**
 * Build the fixed smoke-path household from the two configured test emails, in
 * `ALLOWED_MEMBER_EMAILS` (slot) order. Throws on anything but exactly two
 * distinct, non-empty emails — the same shape `getAllowlistedEmails()` enforces.
 */
export function buildE2eHouseholdGraph(emails: readonly string[]): HouseholdGraph {
  const normalised = emails.map((email) => email.trim().toLowerCase()).filter((e) => e.length > 0);
  if (normalised.length !== 2) {
    throw new Error(`E2E seed needs exactly two test emails, got ${normalised.length}`);
  }
  if (normalised[0] === normalised[1]) {
    throw new Error("E2E seed needs two distinct test emails");
  }

  return makeTypicalHousehold({
    members: [
      makeMember({ id: MEMBER_1_ID, name: E2E_MEMBER_NAMES[0], email: normalised[0] }),
      makeMember({ id: MEMBER_2_ID, name: E2E_MEMBER_NAMES[1], email: normalised[1] }),
    ],
  });
}

/** Resolve a `member` key to its email against the configured allowlist order. */
export function e2eMemberEmail(emails: readonly string[], member: E2eMemberKey): string {
  const graph = buildE2eHouseholdGraph(emails);
  return graph.members[member === "a" ? 0 : 1].email;
}

/* ------------------------------------------------------------------ *
 * Insert rows for `POST /api/test/seed`.
 * ------------------------------------------------------------------ */

/**
 * The exact rows `POST /api/test/seed` inserts, one array per table, shaped for
 * Drizzle's `.values()`. Structural types deliberately — the route feeds each
 * array straight to `tx.insert(schema.X)`, so a schema change that breaks the
 * shape fails to compile *there*.
 *
 * `slot` (member index, 1-based) and the `householdId:effectiveFrom` pattern-
 * version id are the two derived columns; keeping them here — pinned by
 * `e2eHousehold.test.ts` — is the drift guard that `seed.test.ts`'s `skipped`
 * list is for the PGlite helper. `makeTypicalHousehold` carries no closures /
 * absences / requests / assignments, so those tables get no rows; the "empty
 * typical-household shape" test fails loudly if that ever changes.
 */
export interface E2eSeedRows {
  readonly households: readonly { id: string; name: string }[];
  readonly members: readonly {
    id: string;
    householdId: string;
    slot: number;
    name: string;
    email: string;
  }[];
  readonly children: readonly { id: string; householdId: string; name: string }[];
  readonly childcarePatternVersions: readonly {
    id: string;
    householdId: string;
    weekdays: string[];
    effectiveFrom: string;
  }[];
}

/** Turn a `HouseholdGraph` into the per-table insert rows the seed route writes. */
export function e2eSeedRows(graph: HouseholdGraph): E2eSeedRows {
  return {
    households: [{ id: graph.household.id, name: graph.household.name }],
    members: graph.members.map((member, index) => ({
      id: member.id,
      householdId: member.householdId,
      slot: index + 1,
      name: member.name,
      email: member.email,
    })),
    children: [
      { id: graph.child.id, householdId: graph.child.householdId, name: graph.child.name },
    ],
    childcarePatternVersions: graph.pattern.versions.map((version) => ({
      id: `${graph.pattern.householdId}:${version.effectiveFrom}`,
      householdId: graph.household.id,
      weekdays: [...version.weekdays],
      effectiveFrom: version.effectiveFrom,
    })),
  };
}
