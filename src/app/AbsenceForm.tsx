"use client";

import { type DateValue, parseDate } from "@internationalized/date";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { RangeValue } from "react-aria-components";
import type {
  Absence,
  Assignment,
  CalendarDate,
  ChildcarePattern,
  Closure,
  Member,
  PickupRequest,
} from "@/domain";
import { planPickupRequests } from "@/domain";
import {
  AbsenceImpact,
  ActionBar,
  Button,
  Callout,
  DateRangeField,
  Dialog,
  TextArea,
  TextField,
} from "@/ui";
import styles from "./AbsenceForm.module.css";
import { recordAbsenceAction } from "./absenceActions";

/**
 * The "+ I'm out" absence-entry sheet (#51) — declare a one-off absence over a
 * date range, with an optional label + note, and see its impact before saving.
 * A `'use client'` form over the `recordAbsenceAction` Server Action; the
 * childcare-day / request-count preview runs the same pure `planPickupRequests`
 * (`@/domain`) the server does, so the number shown is the number that fires.
 *
 * The range is hard-capped at four weeks from real today (`DateRangeField`'s
 * `maxValue`; `recordAbsence` re-checks server-side); the FAB opens it anchored
 * to today, a day cell to that day. Mounted only while open (`Calendar` gates
 * it), so each open starts fresh.
 */

export interface AbsenceFormProps {
  /** Always `true` in practice — `Calendar` only mounts this while open. */
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The day the sheet is anchored to — real today (FAB) or a tapped cell. */
  readonly anchorDate: CalendarDate;
  /** Real today, `'YYYY-MM-DD'` — the min bound and the 4-week-cap origin. */
  readonly today: CalendarDate;
  readonly currentMemberId: string;
  readonly members: readonly Member[];
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  readonly absences: readonly Absence[];
  readonly assignments: readonly Assignment[];
  readonly pickupRequests: readonly PickupRequest[];
}

function toIsoDate(value: DateValue | null | undefined): CalendarDate | null {
  return value ? value.toString() : null;
}

export function AbsenceForm({
  isOpen,
  onOpenChange,
  anchorDate,
  today: todayIso,
  currentMemberId,
  members,
  pattern,
  closures,
  absences,
  assignments,
  pickupRequests,
}: AbsenceFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Both bounds come from the one server-supplied `today` so they can't
  // disagree across a timezone near midnight.
  const minValue = useMemo(() => parseDate(todayIso), [todayIso]);
  const maxValue = useMemo(() => minValue.add({ weeks: 4 }), [minValue]);

  const [range, setRange] = useState<RangeValue<DateValue> | null>(() => {
    const anchor = parseDate(anchorDate);
    return { start: anchor, end: anchor };
  });
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const startDate = toIsoDate(range?.start);
  const endDate = toIsoDate(range?.end);
  const rangeValid = startDate != null && endDate != null && endDate >= startDate;

  const otherName = members.find((m) => m.id !== currentMemberId)?.name ?? "the other parent";

  const impact = useMemo(() => {
    if (!rangeValid || startDate == null || endDate == null) return null;
    const synthetic: Absence = {
      id: "__preview__",
      householdId: "__preview__",
      memberId: currentMemberId,
      startDate,
      endDate,
    };
    const plan = planPickupRequests({
      startDate,
      endDate,
      pattern,
      closures,
      absences: [...absences, synthetic],
      assignments,
      existingRequests: pickupRequests,
    });
    return { childcareDays: plan.length, requests: plan.filter((e) => e.raise).length };
  }, [
    rangeValid,
    startDate,
    endDate,
    currentMemberId,
    pattern,
    closures,
    absences,
    assignments,
    pickupRequests,
  ]);

  const submit = () => {
    if (!rangeValid || startDate == null || endDate == null) {
      setError("Pick a start and end date, with the end on or after the start.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await recordAbsenceAction({
        startDate,
        endDate,
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onOpenChange(false);
    });
  };

  return (
    <Dialog presentation="sheet" isOpen={isOpen} onOpenChange={onOpenChange}>
      {({ close }) => (
        <div className={styles.body}>
          <Dialog.Header
            title="I'm out"
            leading={
              <Button variant="ghost" size="sm" onPress={close}>
                Cancel
              </Button>
            }
          />

          {error ? (
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          ) : null}

          <DateRangeField
            label="Dates I'm away"
            value={range}
            onChange={setRange}
            minValue={minValue}
            maxValue={maxValue}
            description="Whole days only. Up to four weeks out."
            errorMessage={
              startDate != null && endDate != null && endDate < startDate
                ? "The end date can't be before the start date."
                : undefined
            }
            className={styles.field}
          />

          <TextField
            label="Label"
            isOptional
            value={label}
            onChange={setLabel}
            placeholder="e.g. Work trip"
            className={styles.field}
          />

          <TextArea
            label="Note"
            isOptional
            value={note}
            onChange={setNote}
            placeholder="Anything the other parent should know"
            className={styles.field}
          />

          {impact ? (
            <AbsenceImpact
              childcareDays={impact.childcareDays}
              requests={impact.requests}
              otherParentName={otherName}
              className={styles.impact}
            />
          ) : (
            <Callout tone="info" dot className={styles.impact}>
              Pick a start and end date.
            </Callout>
          )}

          <ActionBar>
            <Button
              variant="primary"
              fullWidth
              isDisabled={pending || !rangeValid}
              onPress={submit}
            >
              {pending ? "Saving…" : "Save absence"}
            </Button>
          </ActionBar>
        </div>
      )}
    </Dialog>
  );
}
