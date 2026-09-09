/**
 * First-sign-in bootstrap (issue #47): materialise the one Household + its two
 * Members + its one Child from the deploy-time email allowlist, or return the
 * existing one. Framework-free (ADR-0005) — the caller resolves the allowlist
 * from env and wires this to auth.
 */

import type { ChildRepository, HouseholdRepository, IdGenerator, MemberRepository } from "../ports";
import type { Household } from "../types";

/** The two allowlisted parent emails, in the order that becomes `memberIds` slot order. */
export type AllowlistedEmails = readonly [string, string];

/** `true` iff `email` (case-insensitively) is one of the two allowlisted emails. */
export function isAllowlistedEmail(email: string, allowlist: AllowlistedEmails): boolean {
  const normalized = email.trim().toLowerCase();
  return allowlist.some((allowed) => allowed.trim().toLowerCase() === normalized);
}

export interface BootstrapHouseholdDeps {
  readonly households: HouseholdRepository;
  readonly members: MemberRepository;
  readonly children: ChildRepository;
  readonly ids: IdGenerator;
}

/** A display name guess from an email's local part: `"alex.p@x.com"` → `"Alex.p"`. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.length > 0 ? local[0].toUpperCase() + local.slice(1) : local;
}

/**
 * Ensure the household exists for `allowlist`, creating it (household + both
 * members + the one child) on the very first call and returning the existing
 * one on every call after — idempotent so either of the two parents can be the
 * one who signs in first (SPEC.md "Household, auth & members").
 *
 * The two members and the child are created together because the "exactly two
 * members / one child" invariant is a deferred constraint that only fires at
 * `COMMIT` (`src/db/schema.ts`) — the caller is responsible for running this
 * against repositories bound to one transaction when creating fresh (see
 * `docs/testing.md` / `repositories.test.ts` "creates a whole household in one
 * transaction"). Not concurrency-safe against two simultaneous first
 * sign-ins — `members.email` is `UNIQUE`, so the loser's write fails loudly
 * rather than corrupting the household; retrying the sign-in resolves it,
 * since by then the winner's household already exists.
 */
export async function bootstrapHousehold(
  deps: BootstrapHouseholdDeps,
  allowlist: AllowlistedEmails,
): Promise<Household> {
  const [firstEmail, secondEmail] = allowlist;
  const [existingFirst, existingSecond] = await Promise.all([
    deps.members.findByEmail(firstEmail),
    deps.members.findByEmail(secondEmail),
  ]);
  const existingMember = existingFirst ?? existingSecond;

  if (existingMember) {
    const household = await deps.households.findById(existingMember.householdId);
    if (!household) {
      throw new Error(
        `member ${existingMember.id} references missing household ${existingMember.householdId}`,
      );
    }
    return household;
  }

  const householdId = deps.ids.next();
  const memberIds: [string, string] = [deps.ids.next(), deps.ids.next()];
  const childId = deps.ids.next();

  const household: Household = {
    id: householdId,
    name: "Our household",
    memberIds,
    childId,
  };

  await deps.households.save(household);
  await Promise.all(
    allowlist.map((email, index) =>
      deps.members.save({
        id: memberIds[index],
        householdId,
        name: nameFromEmail(email),
        email,
      }),
    ),
  );
  await deps.children.save({ id: childId, householdId, name: "Child" });

  return household;
}
