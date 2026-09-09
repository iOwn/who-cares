"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import type { CalendarDate, Weekday } from "@/domain";
import { AbsenceInputError, noopAdapters, recordAbsence, recordRecurringAbsences } from "@/domain";

/**
 * Thin Server Actions for the "+ I'm out" flow: `recordAbsenceAction` for the
 * one-off tab (#51) and `recordRecurringAbsencesAction` for the Recurring tab
 * (#54). Both are adapters over a domain service — no domain logic of their
 * own, not unit-tested (ADR-0005).
 *
 * `recordAbsence` runs in one transaction so the `Absence` and its
 * `PickupRequest`s commit together; the digest it returns is dispatched
 * **after** commit so a slow send can't hold the transaction open. Dispatch
 * itself (email + web push + coalescing) is #55 — a no-op `Notifier` stands in
 * now, so only the implementation behind the port changes.
 *
 * Returns a discriminated result rather than throwing: `AbsenceInputError`
 * messages are plain and safe to show; anything else surfaces as a generic
 * message so an internal error string never reaches the UI.
 */
export type RecordAbsenceResult = { ok: true; requestCount: number } | { ok: false; error: string };

export async function recordAbsenceAction(input: {
  startDate: CalendarDate;
  endDate: CalendarDate;
  label?: string;
  note?: string;
}): Promise<RecordAbsenceResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Your session has expired — please sign in again." };

  let outcome: Awaited<ReturnType<typeof recordAbsence>>;
  try {
    outcome = await db.transaction((tx) =>
      recordAbsence(
        {
          ...createRepositories(tx),
          clock: noopAdapters.systemClock,
          ids: noopAdapters.systemIdGenerator,
        },
        {
          householdId: session.household.id,
          memberId: session.member.id,
          startDate: input.startDate,
          endDate: input.endDate,
          ...(input.label ? { label: input.label } : {}),
          ...(input.note ? { note: input.note } : {}),
        },
      ),
    );
  } catch (thrown) {
    if (thrown instanceof AbsenceInputError) return { ok: false, error: thrown.message };
    console.error("recordAbsenceAction failed", thrown);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }

  if (outcome.notification) {
    // TODO(#55): real Notifier (email + web push + coalescing).
    await noopAdapters.noopNotifier().notify(outcome.notification);
  }

  revalidatePath("/");
  return { ok: true, requestCount: outcome.requests.length };
}

/**
 * Server Action for the Recurring tab of the "+ I'm out" flow (#54). An adapter
 * over the `recordRecurringAbsences` domain service — no domain logic of its
 * own; the weekday expansion, the 4-week-from-today cap, and the idempotency
 * skip all live in `@/domain`.
 *
 * The whole batch — every generated `Absence` and every `PickupRequest` it
 * raises — commits in one transaction; the single bundled digest the service
 * returns is dispatched after commit, exactly as the one-off flow does.
 */
export type RecordRecurringAbsencesResult =
  | { ok: true; createdCount: number; requestCount: number }
  | { ok: false; error: string };

export async function recordRecurringAbsencesAction(input: {
  weekdays: readonly Weekday[];
  startDate: CalendarDate;
  endDate: CalendarDate;
  label?: string;
  note?: string;
}): Promise<RecordRecurringAbsencesResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "Your session has expired — please sign in again." };

  let outcome: Awaited<ReturnType<typeof recordRecurringAbsences>>;
  try {
    outcome = await db.transaction((tx) =>
      recordRecurringAbsences(
        {
          ...createRepositories(tx),
          clock: noopAdapters.systemClock,
          ids: noopAdapters.systemIdGenerator,
        },
        {
          householdId: session.household.id,
          memberId: session.member.id,
          weekdays: input.weekdays,
          startDate: input.startDate,
          endDate: input.endDate,
          ...(input.label ? { label: input.label } : {}),
          ...(input.note ? { note: input.note } : {}),
        },
      ),
    );
  } catch (thrown) {
    if (thrown instanceof AbsenceInputError) return { ok: false, error: thrown.message };
    console.error("recordRecurringAbsencesAction failed", thrown);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }

  if (outcome.notification) {
    // TODO(#55): real Notifier (email + web push + coalescing).
    await noopAdapters.noopNotifier().notify(outcome.notification);
  }

  revalidatePath("/");
  return {
    ok: true,
    createdCount: outcome.absences.length,
    requestCount: outcome.requests.length,
  };
}
