"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Absence, Assignment, CalendarDate, Member, PickupRequest } from "@/domain";
import type { CalendarDayView } from "@/ui";
import { Button, Callout, Dialog, IconButton, isStatusDisplayState, StatePill } from "@/ui";
import styles from "./DayDetail.module.css";
import { longDate, shortDate } from "./formatCalendarDate";
import { cancelAbsenceAction, claimDayAction, withdrawRequestAction } from "./requestActions";

/**
 * `DayDetail` (the design-system's `DayDetailSheet`, #50) — the modal that opens
 * over the grid when a day cell is pressed. A read-only state summary (#50)
 * plus, from #52, the requester-side affordances for a day they have flagged:
 * withdraw the still-open pickup request, or cancel the whole absence behind it.
 *
 * Both are the requester's own actions on their own records; the accept /
 * decline side lives in the `Inbox`. Cancelling an absence never unassigns
 * anyone (SPEC.md, CONTEXT.md) — it just drops the trip and withdraws the
 * requests that no longer need an answer.
 *
 * From #53 it also carries the **direct claim** (ADR-0001): on a contested day
 * the current member is neither already covering nor absent for — pending,
 * at-risk, or resolved by the other parent — a "Claim this day" button takes it
 * outright, newest claim wins, no confirmation. It is deliberately not offered
 * on a quiet (uncontested) day: an implicit "who's on duty" there is out of
 * scope for v1 (SPEC.md "Not yet specified").
 */

export interface DayDetailProps {
  /** The day to show, or `null` when the sheet is closed. */
  readonly day: CalendarDayView | null;
  /** Called with `false` when the sheet should close. */
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Open the "+ I'm out" sheet anchored to this day (SPEC.md "Navigation" —
   * tapping a day cell anchors the entry sheet to that day). Omit to hide the
   * affordance.
   */
  readonly onDeclareAbsence?: (date: CalendarDate) => void;
  /** The signed-in member — decides which requester-side affordances show. */
  readonly currentMemberId?: string;
  /** Every pickup request for the household (any state). */
  readonly pickupRequests?: readonly PickupRequest[];
  /** Every absence for the household. */
  readonly absences?: readonly Absence[];
  /** Every assignment for the household — decides whether a direct claim is offered. */
  readonly assignments?: readonly Assignment[];
  /** Household members — for naming the parent a claim would take over from. */
  readonly members?: readonly Member[];
}

/** Neutral label for the two non-status display states the `StatePill` can't speak. */
const NEUTRAL_LABEL: Record<"quiet" | "off", string> = {
  quiet: "Quiet day",
  off: "No childcare",
};

function absenceCovers(absence: Absence, date: CalendarDate): boolean {
  return absence.startDate <= date && date <= absence.endDate;
}

export function DayDetail({
  day,
  onOpenChange,
  onDeclareAbsence,
  currentMemberId,
  pickupRequests = [],
  absences = [],
  assignments = [],
  members = [],
}: DayDetailProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const myOpenRequest =
    day && currentMemberId
      ? (pickupRequests.find(
          (r) => r.date === day.date && r.state === "Open" && r.requesterId === currentMemberId,
        ) ?? null)
      : null;

  const myAbsence =
    day && currentMemberId
      ? (absences.find((a) => a.memberId === currentMemberId && absenceCovers(a, day.date)) ?? null)
      : null;

  const canDeclare =
    !!onDeclareAbsence && day != null && day.displayState !== "off" && myAbsence == null;

  // Direct claim (#53, ADR-0001): offered on a contested day — pending, at-risk,
  // or resolved by the other parent — that the current member isn't already
  // covering. Not on a quiet/off/closed day (`isStatusDisplayState` gate).
  const dayAssignment =
    day && currentMemberId ? (assignments.find((a) => a.date === day.date) ?? null) : null;
  const iCoverThisDay = dayAssignment?.assigneeId === currentMemberId;
  const canClaim =
    day != null &&
    !!currentMemberId &&
    isStatusDisplayState(day.displayState) &&
    !iCoverThisDay &&
    // Can't sensibly claim a day you've declared yourself out for.
    myAbsence == null;
  const claimTakesOverFrom =
    canClaim && dayAssignment?.assigneeId && dayAssignment.assigneeId !== currentMemberId
      ? (members.find((m) => m.id === dayAssignment.assigneeId)?.name ?? "the other parent")
      : null;

  const showActions = myOpenRequest != null || myAbsence != null || canDeclare || canClaim;

  const run = (
    action: () => Promise<{ ok: true; note?: string } | { ok: false; error: string }>,
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      presentation="sheet"
      isOpen={day != null}
      onOpenChange={(open) => {
        if (!open) setError(null);
        onOpenChange(open);
      }}
    >
      {({ close }) =>
        day == null ? (
          <span />
        ) : (
          <div className={styles.body}>
            <Dialog.Header
              title={longDate(day.date)}
              trailing={
                <IconButton variant="ghost" size="sm" aria-label="Close" onPress={close}>
                  <X size={18} aria-hidden />
                </IconButton>
              }
            />
            <div className={styles.state}>
              {isStatusDisplayState(day.displayState) ? (
                <StatePill state={day.displayState} />
              ) : (
                <span className={styles.neutralPill}>
                  <span className={styles.neutralDot} aria-hidden />
                  {NEUTRAL_LABEL[day.displayState]}
                </span>
              )}
            </div>
            <p className={styles.narrative}>{day.narrative}</p>
            {day.displayState === "closed" && day.closureReason ? (
              <p className={styles.reason}>Reason given: {day.closureReason}</p>
            ) : null}

            {error ? (
              <Callout tone="danger" role="alert">
                {error}
              </Callout>
            ) : null}

            {myAbsence ? (
              <p className={styles.reason}>
                Cancelling clears your whole absence
                {myAbsence.startDate === myAbsence.endDate
                  ? ` on ${shortDate(myAbsence.startDate)}`
                  : ` (${shortDate(myAbsence.startDate)} – ${shortDate(myAbsence.endDate)})`}
                . Any pickup already accepted for those days still stands.
              </p>
            ) : null}

            {claimTakesOverFrom ? (
              <p className={styles.reason}>
                Claiming this day takes over from {claimTakesOverFrom}. They&rsquo;ll be notified
                &mdash; there&rsquo;s no confirmation step.
              </p>
            ) : null}

            {showActions ? (
              <div className={styles.actions}>
                {myOpenRequest ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={pending}
                    onPress={() => run(() => withdrawRequestAction(myOpenRequest.id))}
                  >
                    Withdraw request
                  </Button>
                ) : null}
                {myAbsence ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={pending}
                    onPress={() => run(() => cancelAbsenceAction(myAbsence.id))}
                  >
                    Cancel my absence
                  </Button>
                ) : null}
                {canDeclare ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => onDeclareAbsence?.(day.date)}
                  >
                    I&rsquo;m out this day
                  </Button>
                ) : null}
                {canClaim ? (
                  <Button
                    variant="primary"
                    size="sm"
                    isDisabled={pending}
                    onPress={() => run(() => claimDayAction(day.date))}
                  >
                    Claim this day
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      }
    </Dialog>
  );
}
