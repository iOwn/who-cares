/**
 * The auth seam Server Components / route handlers use — `auth` itself plus
 * `getCurrentSession()`, which resolves a Better Auth session down to the
 * domain `Member` + `Household` (`./config.ts` explains why this whole
 * directory is Next-coupled, unlike `src/db` / `src/domain`).
 */

import { headers } from "next/headers";
// Deep import, not the `@/db` barrel — see the comment in `./config.ts`.
import { createRepositories } from "@/db/repositories";
import type { Child, Household, Member } from "@/domain";
import { auth, db } from "./config";

export { auth };

export interface CurrentSession {
  readonly member: Member;
  readonly household: Household;
  readonly child: Child | null;
}

/**
 * `null` when signed out, or when a session's email no longer matches a
 * `Member` (e.g. the allowlist changed since the session was minted) — either
 * way, the caller should render the sign-in screen.
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const repos = createRepositories(db);
  const member = await repos.members.findByEmail(session.user.email);
  if (!member) return null;

  const household = await repos.households.findById(member.householdId);
  if (!household) return null;

  const child = await repos.children.findByHousehold(household.id);

  return { member, household, child };
}
