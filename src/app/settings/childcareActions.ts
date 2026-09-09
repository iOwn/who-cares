"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import type { CalendarDate, ChildcarePatternVersion, Weekday } from "@/domain";

/**
 * Thin Server Actions for the childcare-settings feature (#49). Adapters over
 * the repositories + the effective-dated-pattern rule (ADR-0002) — no domain
 * logic of their own, not unit-tested (ADR-0005). Kept in their own file so a
 * merge with the parallel #48 settings work stays mechanical.
 */

async function context() {
  const session = await getCurrentSession();
  if (!session) throw new Error("Not signed in");
  return { householdId: session.household.id, repos: createRepositories(db) };
}

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/");
}

/** Insert (or replace, if one already starts on that date) a pattern version. */
function upsertVersion(
  versions: readonly ChildcarePatternVersion[],
  next: ChildcarePatternVersion,
): ChildcarePatternVersion[] {
  return [...versions.filter((v) => v.effectiveFrom !== next.effectiveFrom), next].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : 1,
  );
}

export async function savePatternAction(input: {
  weekdays: Weekday[];
  effectiveFrom: CalendarDate;
}): Promise<void> {
  const { householdId, repos } = await context();
  const existing = await repos.childcarePattern.findByHousehold(householdId);
  const versions = upsertVersion(existing?.versions ?? [], {
    weekdays: input.weekdays,
    effectiveFrom: input.effectiveFrom,
  });
  // `childcarePattern.save` is delete-then-insert; run it in one transaction so
  // a mid-write failure can't leave the household with no pattern at all
  // (`src/db/repositories/childcarePattern.ts`; same pattern as
  // `src/auth/config.ts`'s household bootstrap).
  await db.transaction((tx) =>
    createRepositories(tx).childcarePattern.save({ id: householdId, householdId, versions }),
  );
  revalidateAll();
}

/** `true` iff `id` names a closure that belongs to `householdId`. */
async function closureBelongsToHousehold(
  repos: Awaited<ReturnType<typeof context>>["repos"],
  householdId: string,
  id: string,
): Promise<boolean> {
  const owned = await repos.closures.listByHousehold(householdId);
  return owned.some((closure) => closure.id === id);
}

export async function saveClosureAction(input: {
  /** Present when editing an existing closure. */
  id?: string;
  date: CalendarDate;
  reason?: string;
}): Promise<void> {
  const { householdId, repos } = await context();
  const reason = input.reason?.trim() ? input.reason.trim() : undefined;

  // One closure per date: reuse the row already on that date if there is one.
  // A client-supplied `id` is only honoured if it's this household's row —
  // otherwise `save`'s upsert could re-parent someone else's closure (latent
  // until multi-household, but cheap to close now).
  const onDate = await repos.closures.findByDate(householdId, input.date);
  const editId =
    input.id && (await closureBelongsToHousehold(repos, householdId, input.id))
      ? input.id
      : undefined;
  const id = editId ?? onDate?.id ?? crypto.randomUUID();

  await repos.closures.save({ id, householdId, date: input.date, ...(reason ? { reason } : {}) });
  revalidateAll();
}

export async function removeClosureAction(id: string): Promise<void> {
  const { householdId, repos } = await context();
  // `ClosureRepository.delete` takes a bare id; scope it to the household here
  // so a stray id can't drop another household's row (latent in single-
  // household v1 — see `saveClosureAction`).
  if (!(await closureBelongsToHousehold(repos, householdId, id))) return;
  await repos.closures.delete(id);
  revalidateAll();
}
