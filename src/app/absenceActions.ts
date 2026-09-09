"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import type { CalendarDate } from "@/domain";
import { noopAdapters, recordAbsence } from "@/domain";

/**
 * Thin Server Action for the "+ I'm out" absence flow (#51). An adapter over
 * the `recordAbsence` domain service (`src/domain/services/pickupRequestGeneration.ts`)
 * — no domain logic of its own, not unit-tested (ADR-0005).
 *
 * The whole thing runs in one transaction so the `Absence` and the
 * `PickupRequest`s it raises commit together. `notifier` is the no-op adapter
 * for now — real email + web-push dispatch and the recipient/coalescing matrix
 * land in the notifications ticket (#55, `Notifier` port); this action already
 * calls the port so #55 only swaps the implementation.
 */
export async function recordAbsenceAction(input: {
  startDate: CalendarDate;
  endDate: CalendarDate;
  label?: string;
  note?: string;
}): Promise<{ requestCount: number }> {
  const session = await getCurrentSession();
  if (!session) throw new Error("Not signed in");

  const result = await db.transaction((tx) =>
    recordAbsence(
      {
        ...createRepositories(tx),
        clock: noopAdapters.systemClock,
        ids: noopAdapters.systemIdGenerator,
        // TODO(#55): real Notifier (email + web push + coalescing).
        notifier: noopAdapters.noopNotifier(),
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

  revalidatePath("/");
  return { requestCount: result.requests.length };
}
