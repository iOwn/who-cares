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
  await repos.childcarePattern.save({ id: householdId, householdId, versions });
  revalidateAll();
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
  const onDate = await repos.closures.findByDate(householdId, input.date);
  const id = input.id ?? onDate?.id ?? crypto.randomUUID();

  await repos.closures.save({ id, householdId, date: input.date, ...(reason ? { reason } : {}) });
  revalidateAll();
}

export async function removeClosureAction(id: string): Promise<void> {
  const { repos } = await context();
  await repos.closures.delete(id);
  revalidateAll();
}
