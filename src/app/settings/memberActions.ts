"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import { validateMemberName } from "@/domain";

/**
 * Server Actions for the *personal* settings tab (issue #143) — what the
 * signed-in member changes about themselves. The household tab's actions live
 * in `./childcareActions.ts`; keep the two apart, because everything over there
 * notifies the other parent and nothing here does.
 */

export type RenameMemberResult = { ok: true; name: string } | { ok: false; error: string };

/**
 * Set the signed-in member's display name (issue #153).
 *
 * Takes no member id on purpose — a member can rename only themselves, and
 * the actor is whoever holds the session. The name is the one `members.name`
 * column every surface already reads (calendar, Inbox, `PersonChip`, the
 * notification copy), so nothing else needs to change; `MemberRepository.save`
 * keeps the slot, so `Household.memberIds` order is untouched.
 *
 * **Not a notification event.** Renaming yourself is personal (unlike the
 * household tab's catalogue events 11 + 12) — the other parent simply sees the
 * new name on their next load. Don't add one by analogy.
 *
 * Validation answers with a `{ ok: false }` result rather than a throw — a
 * thrown message doesn't survive a production build (see
 * `./childcareActions.ts`), and an empty name is the parent's mistake to fix,
 * not a bug to log.
 */
export async function renameMemberAction(input: string): Promise<RenameMemberResult> {
  const session = await getCurrentSession();
  if (!session) throw new Error("Not signed in");

  // A hand-crafted call can send anything; a non-string is not a name.
  const validated = validateMemberName(typeof input === "string" ? input : "");
  if (!validated.ok) return validated;

  const repos = createRepositories(db);
  await repos.members.save({ ...session.member, name: validated.name });

  // The name is on the calendar and in the household tab's lead line; the
  // `"layout"` type covers every route under the settings segment.
  revalidatePath("/settings", "layout");
  revalidatePath("/");

  return { ok: true, name: validated.name };
}
