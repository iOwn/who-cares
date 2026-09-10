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
