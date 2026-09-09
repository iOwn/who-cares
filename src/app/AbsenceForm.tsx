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
  Weekday,
} from "@/domain";
import { planPickupRequests, planRecurringAbsences } from "@/domain";
import {
  AbsenceImpact,
  ActionBar,
  Button,
  Callout,
  DateRangeField,
  Dialog,
  RecurringPreview,
  SegmentedControl,
  TextArea,
  TextField,
  WeekdayPicker,
} from "@/ui";
import styles from "./AbsenceForm.module.css";
import { recordAbsenceAction, recordRecurringAbsencesAction } from "./absenceActions";

/**
 * The "+ I'm out" absence-entry sheet (#51, #54) — two tabs over one date range:
 *
 *   - **One-off**: declare a single absence spanning the range, with an optional
 *     label + note, and see its pickup-request impact before saving.
 *   - **Recurring** (#54): pick a weekday set instead; on save the range is
 *     expanded into one ordinary one-off `Absence` per matching weekday. The
 *     weekday picker starts blank every time (no saved "usual office days" in
 *     v1, SPEC.md).
 *
 * A `'use client'` form over the `recordAbsenceAction` / `recordRecurringAbsencesAction`
 * Server Actions; both previews run the same pure `@/domain` functions the
 * server does, so the numbers shown are the numbers that fire.
 *
 * The range is hard-capped at four weeks from real today (`DateRangeField`'s
 * `maxValue`; the domain services re-check server-side — `recordAbsence`'s span
 * cap and `planRecurringAbsences`'s from-today horizon). The FAB opens it
 * anchored to today, a day cell to that day. Mounted only while open (`Calendar`
 * gates it), so each open starts fresh.
 */

type Mode = "oneoff" | "recurring";

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
  const [mode, setMode] = useState<Mode>("oneoff");

  // Both bounds come from the one server-supplied `today` so they can't
  // disagree across a timezone near midnight.
  const minValue = useMemo(() => parseDate(todayIso), [todayIso]);
  const maxValue = useMemo(() => minValue.add({ weeks: 4 }), [minValue]);

  const [range, setRange] = useState<RangeValue<DateValue> | null>(() => {
    const anchor = parseDate(anchorDate);
    return { start: anchor, end: anchor };
  });
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const startDate = toIsoDate(range?.start);
  const endDate = toIsoDate(range?.end);
  const rangeValid = startDate != null && endDate != null && endDate >= startDate;

  const otherName = members.find((m) => m.id !== currentMemberId)?.name ?? "the other parent";

  const impact = useMemo(() => {
    if (mode !== "oneoff" || !rangeValid || startDate == null || endDate == null) return null;
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
    mode,
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

  const recurring = useMemo(() => {
    if (mode !== "recurring" || !rangeValid || startDate == null || endDate == null) return null;
    const plan = planRecurringAbsences({
      weekdays,
      startDate,
      endDate,
      today: todayIso,
      memberId: currentMemberId,
      existingAbsences: absences,
    });
    return {
      toCreate: plan.toCreate.length,
      alreadyCovered: plan.days.filter((d) => d.alreadyCovered).length,
      capped: plan.capped,
    };
  }, [mode, rangeValid, startDate, endDate, weekdays, todayIso, currentMemberId, absences]);

  const canSubmit =
    rangeValid &&
    !pending &&
    (mode === "oneoff" || (weekdays.length > 0 && (recurring?.toCreate ?? 0) > 0));

  const submit = () => {
    if (!rangeValid || startDate == null || endDate == null) {
      setError("Pick a start and end date, with the end on or after the start.");
      return;
    }
    if (mode === "recurring" && weekdays.length === 0) {
      setError("Pick at least one weekday to repeat.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const trimmedLabel = label.trim();
      const trimmedNote = note.trim();
      const result =
        mode === "oneoff"
          ? await recordAbsenceAction({
              startDate,
              endDate,
              ...(trimmedLabel ? { label: trimmedLabel } : {}),
              ...(trimmedNote ? { note: trimmedNote } : {}),
            })
          : await recordRecurringAbsencesAction({
              weekdays,
              startDate,
              endDate,
              ...(trimmedLabel ? { label: trimmedLabel } : {}),
              ...(trimmedNote ? { note: trimmedNote } : {}),
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

          <SegmentedControl
            aria-label="Absence type"
            value={mode}
            onChange={(value) => {
              setMode(value as Mode);
              setError(null);
            }}
            className={styles.field}
          >
            <SegmentedControl.Item value="oneoff">One-off</SegmentedControl.Item>
            <SegmentedControl.Item value="recurring">Recurring</SegmentedControl.Item>
          </SegmentedControl>

          {error ? (
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          ) : null}

          {mode === "recurring" ? (
            <WeekdayPicker
              aria-label="Weekdays I'm out"
              value={weekdays}
              onChange={setWeekdays}
              className={styles.field}
            />
          ) : null}

          <DateRangeField
            label={mode === "recurring" ? "Between these dates" : "Dates I'm away"}
            value={range}
            onChange={setRange}
            minValue={minValue}
            maxValue={maxValue}
            description={
              mode === "recurring"
                ? "One absence per matching weekday. Up to four weeks out."
                : "Whole days only. Up to four weeks out."
            }
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

          {mode === "recurring" ? (
            recurring && weekdays.length > 0 ? (
              <RecurringPreview
                toCreate={recurring.toCreate}
                alreadyCovered={recurring.alreadyCovered}
                capped={recurring.capped}
                className={styles.impact}
              />
            ) : (
              <Callout tone="info" dot className={styles.impact}>
                Pick weekdays and a date range.
              </Callout>
            )
          ) : impact ? (
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
            <Button variant="primary" fullWidth isDisabled={!canSubmit} onPress={submit}>
              {pending ? "Saving…" : "Save absence"}
            </Button>
          </ActionBar>
        </div>
      )}
    </Dialog>
  );
}
