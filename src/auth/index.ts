/**
 * The auth seam Server Components / route handlers use — `auth` itself plus
 * `getCurrentSession()`, which resolves a Better Auth session down to the
 * domain `Member` + `Household` (`./config.ts` explains why this whole
 * directory is Next-coupled, unlike `src/db` / `src/domain`).
 */

import { headers } from "next/headers";
import { cache } from "react";
// Deep import, not the `@/db` barrel — see the comment in `./config.ts`.
import { createRepositories } from "@/db/repositories";
import type { Child, Household, Member } from "@/domain";
import { auth, db } from "./config";

export { auth };

export interface CurrentSession {
  readonly member: Member;
  readonly household: Household;
  readonly child: Child | null;
  /**
   * The Better Auth session token behind this request — what `listSessions`
   * rows carry, so a caller can tell "this device" apart without a second
   * `auth.api.getSession` round-trip (issue #144).
   */
  readonly sessionToken: string;
}

/**
 * `null` when signed out, or when a session's email no longer matches a
 * `Member` (e.g. the allowlist changed since the session was minted) — either
 * way, the caller should render the sign-in screen.
 *
 * Every authenticated render pays for this before it can do anything else, so
 * it is kept to three serialised round-trips: the session, the member, then
 * household + child side by side (both only need `member.householdId`). Wrapped
 * in React `cache()` so a page and the Server Actions / components it renders
 * in the same request share one resolution (issue #144).
 */
export const getCurrentSession = cache(
  async function getCurrentSession(): Promise<CurrentSession | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;

    const repos = createRepositories(db);
    const member = await repos.members.findByEmail(session.user.email);
    if (!member) return null;

    const [household, child] = await Promise.all([
      repos.households.findById(member.householdId),
      repos.children.findByHousehold(member.householdId),
    ]);
    if (!household) return null;

    return { member, household, child, sessionToken: session.session.token };
  },
);
