"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import type { CalendarDate } from "@/domain";
import {
  AbsenceInputError,
  acceptRequest,
  cancelAbsence,
  declineRequest,
  type Notification,
  noopAdapters,
  type PickupRequestResolutionDeps,
  PickupRequestStateError,
  shortenAbsence,
  withdrawRequest,
} from "@/domain";

/**
 * Thin Server Actions for the pickup-request lifecycle (#52) — accept / decline
 * / withdraw a request, and cancel / shorten the absence behind one. Adapters
 * over the `pickupRequestResolution` / `absenceCancellation` domain services
 * (ADR-0005): no domain logic of their own, not unit-tested.
 *
 * Each runs its service in one `db.transaction` so the request transition and
 * its side effect (an `Assignment`, a batch of withdrawals) commit together;
 * the notifications the service returns are dispatched **after** commit so a
 * slow send can't hold the transaction open. Real dispatch (email + web push +
 * coalescing) is #55 — a no-op `Notifier` stands in now.
 *
 * They return a discriminated result rather than throwing: `AbsenceInputError`
 * / `PickupRequestStateError` messages are plain and safe to show; anything
 * else surfaces as a generic message so an internal error string never reaches
 * the UI.
 */

export type RequestActionResult = { ok: true; note?: string } | { ok: false; error: string };

const EXPIRED: RequestActionResult = {
  ok: false,
  error: "Your session has expired — please sign in again.",
};
const GENERIC: RequestActionResult = {
  ok: false,
  error: "Something went wrong. Please try again.",
};

/** Dispatch post-commit notifications through the (currently no-op) Notifier. */
async function dispatch(notifications: readonly Notification[]): Promise<void> {
  const notifier = noopAdapters.noopNotifier();
  for (const notification of notifications) {
    // TODO(#55): real Notifier (email + web push + coalescing).
    await notifier.notify(notification);
  }
}

function toResult(thrown: unknown, label: string): RequestActionResult {
  if (thrown instanceof PickupRequestStateError || thrown instanceof AbsenceInputError) {
    return { ok: false, error: thrown.message };
  }
  console.error(`${label} failed`, thrown);
  return GENERIC;
}

const SUPERSEDED_NOTE =
  "That day was already covered by someone else, so the request was withdrawn instead.";

/**
 * Shared shape for the accept / decline / withdraw trio: run the domain service
 * in one transaction, then — outside the `try`, matching `recordAbsenceAction` —
 * dispatch its notification and revalidate. `superseded` (a direct claim landed
 * first) surfaces as a calm note, not an error.
 */
async function runRequestResolution(
  label: string,
  requestId: string,
  service: (
    deps: PickupRequestResolutionDeps,
    input: { requestId: string; actingMemberId: string },
  ) => Promise<{ notification: Notification; superseded?: boolean }>,
): Promise<RequestActionResult> {
  const session = await getCurrentSession();
  if (!session) return EXPIRED;

  let outcome: { notification: Notification; superseded?: boolean };
  try {
    outcome = await db.transaction((tx) =>
      service(
        {
          ...createRepositories(tx),
          clock: noopAdapters.systemClock,
          ids: noopAdapters.systemIdGenerator,
        },
        { requestId, actingMemberId: session.member.id },
      ),
    );
  } catch (thrown) {
    return toResult(thrown, label);
  }

  await dispatch([outcome.notification]);
  revalidatePath("/");
  return outcome.superseded ? { ok: true, note: SUPERSEDED_NOTE } : { ok: true };
}

export async function acceptRequestAction(requestId: string): Promise<RequestActionResult> {
  return runRequestResolution("acceptRequestAction", requestId, acceptRequest);
}

export async function declineRequestAction(requestId: string): Promise<RequestActionResult> {
  return runRequestResolution("declineRequestAction", requestId, declineRequest);
}

export async function withdrawRequestAction(requestId: string): Promise<RequestActionResult> {
  return runRequestResolution("withdrawRequestAction", requestId, withdrawRequest);
}

export async function cancelAbsenceAction(absenceId: string): Promise<RequestActionResult> {
  const session = await getCurrentSession();
  if (!session) return EXPIRED;

  try {
    const outcome = await db.transaction((tx) =>
      cancelAbsence(createRepositories(tx), {
        absenceId,
        actingMemberId: session.member.id,
      }),
    );
    await dispatch(outcome.notifications);
  } catch (thrown) {
    return toResult(thrown, "cancelAbsenceAction");
  }

  revalidatePath("/");
  return { ok: true };
}

export async function shortenAbsenceAction(input: {
  absenceId: string;
  startDate: CalendarDate;
  endDate: CalendarDate;
}): Promise<RequestActionResult> {
  const session = await getCurrentSession();
  if (!session) return EXPIRED;

  try {
    const outcome = await db.transaction((tx) =>
      shortenAbsence(createRepositories(tx), {
        absenceId: input.absenceId,
        actingMemberId: session.member.id,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    );
    await dispatch(outcome.notifications);
  } catch (thrown) {
    return toResult(thrown, "shortenAbsenceAction");
  }

  revalidatePath("/");
  return { ok: true };
}
