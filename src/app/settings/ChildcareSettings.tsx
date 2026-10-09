"use client";

import { type DateValue, parseDate } from "@internationalized/date";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { RangeValue } from "react-aria-components";
import type { CalendarDate, ChildcarePattern, Closure, ClosureRange, Weekday } from "@/domain";
import {
  eachDateInclusive,
  groupClosureRanges,
  MAX_CLOSURE_RANGE_DAYS,
  resolvePatternVersion,
} from "@/domain";
import {
  ActionBar,
  Button,
  Callout,
  ClosureRow,
  DateField,
  DateRangeField,
  SectionHeading,
  Surface,
  TextField,
  ToggleGroup,
  WeekdayPicker,
} from "@/ui";
import styles from "./ChildcareSettings.module.css";
import {
  removeClosuresAction,
  replaceClosureRangeAction,
  saveClosureAction,
  saveClosuresAction,
  savePatternAction,
} from "./childcareActions";

/**
 * The childcare-settings feature (#49) — set the effective-dated pattern and
 * manage closures. A `'use client'` form over thin Server Actions
 * (`./childcareActions`); no domain logic here (ADR-0005). Rendered as
 * the body of the household tab, `./household/page.tsx` (issue #143 owns the
 * route shell + header).
 *
 * Adding closures takes a **date range** (issue #131), editing one takes a
 * single date. A holiday week is then one action — still one `Closure` row per
 * date, per CONTEXT.md, but one notification to the other parent instead of
 * five (ADR-0018).
 *
 * `holidays` (issue #167, ADR-0020) is a second, **read-only** list below the
 * manual one: public holidays derived from the household's Bundesland
 * (`./BundeslandCard`), never stored rows, so there is nothing here to edit
 * or remove — only to show. `closures` itself only ever holds manual rows
 * (`./household/page.tsx` passes `listByHousehold`'s result straight through,
 * never the merged view `page.tsx`'s calendar uses).
 */

export interface ChildcareSettingsProps {
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  /** Derived public holidays for the household's Bundesland — read-only (issue #167). */
  readonly holidays: readonly Closure[];
  /** `'YYYY-MM-DD'` (the server's today) — the default "effective from" date. */
  readonly today: CalendarDate;
}

function iso(value: DateValue | null): CalendarDate | null {
  return value ? value.toString() : null;
}

/**
 * A `{ ok: false, error }` answer from a Server Action. Actions that only ever
 * return `void` (the pattern + remove actions) fall through as successes.
 */
function isFailure(result: unknown): result is { ok: false; error: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "ok" in result &&
    result.ok === false &&
    "error" in result &&
    typeof result.error === "string"
  );
}

function formatDate(date: CalendarDate): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `Mon, Aug 4 – Fri, Aug 8, 2026`; the year goes on both ends only when they differ. */
function formatRange(start: CalendarDate, end: CalendarDate): string {
  if (start === end) return formatDate(start);
  const short = (date: CalendarDate, year: boolean) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(year ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${short(start, !sameYear)} – ${short(end, true)}`;
}

/** One range in the add form (issue #166). `key` is a stable React key across removals. */
interface ClosureFormRow {
  key: number;
  range: RangeValue<DateValue> | null;
  reason: string;
  needsCover: boolean;
}

let nextRowKey = 0;
/** New rows default to *care still needed* — a wrongly hidden day is the dangerous error (ADR-0021). */
const newRow = (): ClosureFormRow => ({
  key: nextRowKey++,
  range: null,
  reason: "",
  needsCover: true,
});

/** Care still needed (the facility is shut, the child is not) vs. no care needed. */
function CareToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (needsCover: boolean) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Is care still needed?"
      selectionMode="single"
      disallowEmptySelection
      value={[value ? "needed" : "none"]}
      onChange={([next]) => onChange(next !== "none")}
    >
      <ToggleGroup.Item value="needed">Care still needed</ToggleGroup.Item>
      <ToggleGroup.Item value="none">No care needed</ToggleGroup.Item>
    </ToggleGroup>
  );
}

export function ChildcareSettings({ pattern, closures, holidays, today }: ChildcareSettingsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // The pattern editor is seeded from the version currently in effect.
  const currentWeekdays = (resolvePatternVersion(pattern, today)?.weekdays ?? []) as Weekday[];
  const [weekdays, setWeekdays] = useState<Weekday[]>([...currentWeekdays]);
  const [effectiveFrom, setEffectiveFrom] = useState<DateValue | null>(() => parseDate(today));

  // Closures. Adding takes a *list* of rows (issue #166) — a whole year of
  // training days and the summer break in one submit; editing is pinned to the
  // one row's date, so the edit form swaps the row list for a single `DateField`.
  const [rows, setRows] = useState<ClosureFormRow[]>(() => [newRow()]);
  const [closureDate, setClosureDate] = useState<DateValue | null>(null);
  // The edited group's range (issue #171) — used when the group spans several days.
  const [closureRange, setClosureRange] = useState<RangeValue<DateValue> | null>(null);
  const [closureReason, setClosureReason] = useState("");
  const [closureNeedsCoverEdit, setClosureNeedsCoverEdit] = useState(true);
  // The group being edited — one list row, which may be several stored days.
  const [editing, setEditing] = useState<ClosureRange | null>(null);
  const ranges = groupClosureRanges(closures);

  const updateRow = (key: number, patch: Partial<ClosureFormRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const resetClosureForm = () => {
    setRows([newRow()]);
    setClosureDate(null);
    setClosureRange(null);
    setClosureReason("");
    setClosureNeedsCoverEdit(true);
    setEditing(null);
  };

  /**
   * Run a settings action. An action that answers with a `{ ok: false }` result
   * surfaces its message as-is (that is the only way a user-facing message
   * survives a production build); a thrown error is a bug or an expired
   * session, and Next has already replaced its message with a generic one, so
   * it lands in the same callout.
   */
  const run = (work: () => Promise<unknown>, onSuccess?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (isFailure(result)) return setError(result.error);
        onSuccess?.();
        router.refresh();
      } catch (thrown) {
        setError(thrown instanceof Error ? thrown.message : "Something went wrong");
      }
    });
  };

  const submitPattern = () => {
    const from = iso(effectiveFrom);
    if (!from) return setError("Pick a date the pattern takes effect from");
    run(() => savePatternAction({ weekdays, effectiveFrom: from }));
  };

  /**
   * `saveClosureAction` answers with a result rather than throwing, because a
   * thrown message doesn't survive a production build (see the action). The
   * range checks are repeated here only so the common mistakes answer instantly
   * — the server re-checks both, and its answer is the one that counts.
   */
  const submitClosure = () => {
    if (editing && editing.dayCount > 1) {
      const start = iso(closureRange?.start ?? null);
      const end = iso(closureRange?.end ?? null);
      if (!start || !end) return setError("Pick the closure dates");
      if (end < start) return setError("The last closure date can't be before the first");
      return run(
        () =>
          replaceClosureRangeAction({
            ids: [...editing.ids],
            date: start,
            endDate: end,
            reason: closureReason,
            needsCover: closureNeedsCoverEdit,
          }),
        resetClosureForm,
      );
    }
    if (editing) {
      const date = iso(closureDate);
      if (!date) return setError("Pick the closure date");
      return run(
        () =>
          saveClosureAction({
            id: editing.ids[0],
            date,
            reason: closureReason,
            needsCover: closureNeedsCoverEdit,
          }),
        resetClosureForm,
      );
    }

    const entries: {
      date: CalendarDate;
      endDate: CalendarDate;
      reason: string;
      needsCover: boolean;
    }[] = [];
    for (const [index, row] of rows.entries()) {
      const where = rows.length > 1 ? `Row ${index + 1}: ` : "";
      const start = iso(row.range?.start ?? null);
      const end = iso(row.range?.end ?? null);
      if (!start || !end) return setError(`${where}Pick the closure dates`);
      if (end < start) return setError(`${where}The last closure date can't be before the first`);
      if (eachDateInclusive(start, end).length > MAX_CLOSURE_RANGE_DAYS) {
        return setError(
          `${where}That's more than ${MAX_CLOSURE_RANGE_DAYS} days of closures in one go — add them in shorter stretches.`,
        );
      }
      entries.push({ date: start, endDate: end, reason: row.reason, needsCover: row.needsCover });
    }
    run(() => saveClosuresAction({ entries }), resetClosureForm);
  };

  const editClosure = (range: ClosureRange) => {
    setEditing(range);
    setClosureDate(parseDate(range.startDate));
    setClosureRange({ start: parseDate(range.startDate), end: parseDate(range.endDate) });
    setClosureReason(range.reason ?? "");
    setClosureNeedsCoverEdit(range.needsCover);
    setError(null);
  };

  return (
    <div className={styles.root}>
      {error ? (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      ) : null}

      <section>
        <SectionHeading>Which days need pickup</SectionHeading>
        <p className={styles.hint}>The weekdays the child is normally in childcare.</p>
        <WeekdayPicker
          aria-label="Which weekdays"
          value={weekdays}
          onChange={setWeekdays}
          className={styles.weekdays}
        />
        <DateField
          label="Effective from"
          value={effectiveFrom}
          onChange={setEffectiveFrom}
          description="Earlier weeks keep whatever pattern was in effect then."
          className={styles.field}
        />
      </section>

      <section>
        <SectionHeading>Closures</SectionHeading>
        {ranges.length === 0 ? (
          <p className={styles.hint}>No closures yet.</p>
        ) : (
          <ul className={styles.closureList}>
            {ranges.map((range) => (
              <li key={range.ids[0]}>
                <ClosureRow
                  title={formatRange(range.startDate, range.endDate)}
                  dayCount={range.dayCount}
                  reason={range.reason}
                  kind={range.needsCover ? "Care at home" : "No care needed"}
                  isRemoveDisabled={pending}
                  removeLabel={
                    range.dayCount > 1
                      ? `Remove ${formatRange(range.startDate, range.endDate)}`
                      : undefined
                  }
                  onEdit={() => editClosure(range)}
                  onRemove={() => run(() => removeClosuresAction([...range.ids]))}
                />
              </li>
            ))}
          </ul>
        )}

        <Surface variant="sunken" className={styles.closureForm}>
          <p className={styles.closureFormTitle}>{editing ? "Edit closure" : "Add closures"}</p>
          {editing ? (
            <>
              {editing.dayCount > 1 ? (
                <DateRangeField
                  label="Dates"
                  value={closureRange}
                  onChange={setClosureRange}
                  errorMessage="The last closure date can't be before the first."
                  className={styles.field}
                />
              ) : (
                <DateField
                  label="Date"
                  value={closureDate}
                  onChange={setClosureDate}
                  className={styles.field}
                />
              )}
              <CareToggle value={closureNeedsCoverEdit} onChange={setClosureNeedsCoverEdit} />
              <TextField
                label="Reason"
                isOptional
                value={closureReason}
                onChange={setClosureReason}
                placeholder="e.g. Staff training day"
                className={styles.field}
              />
            </>
          ) : (
            <>
              {rows.map((row, index) => (
                <div key={row.key} className={styles.closureEntry}>
                  {rows.length > 1 ? (
                    <div className={styles.closureEntryHead}>
                      <p className={styles.closureEntryTitle}>Closure {index + 1}</p>
                      <Button
                        variant="ghost"
                        tone="danger"
                        size="sm"
                        onPress={() =>
                          setRows((current) => current.filter((r) => r.key !== row.key))
                        }
                      >
                        <Trash2 size={14} aria-hidden /> Remove
                      </Button>
                    </div>
                  ) : null}
                  <DateRangeField
                    label="Dates"
                    value={row.range}
                    onChange={(range) => updateRow(row.key, { range })}
                    description="A single day or a whole stretch — pick the same day twice for one."
                    errorMessage="The last closure date can't be before the first."
                    className={styles.field}
                  />
                  <CareToggle
                    value={row.needsCover}
                    onChange={(needsCover) => updateRow(row.key, { needsCover })}
                  />
                  <TextField
                    label="Reason"
                    isOptional
                    value={row.reason}
                    onChange={(reason) => updateRow(row.key, { reason })}
                    placeholder="e.g. Staff training day"
                    className={styles.field}
                  />
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setRows((current) => [...current, newRow()])}
              >
                <Plus size={14} aria-hidden /> Add another
              </Button>
            </>
          )}
          <div className={styles.closureFormActions}>
            {editing ? (
              <Button variant="ghost" size="sm" onPress={resetClosureForm}>
                Cancel
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" isDisabled={pending} onPress={submitClosure}>
              {editing
                ? "Save closure"
                : rows.length > 1
                  ? `Add ${rows.length} closures`
                  : "Add closures"}
            </Button>
          </div>
        </Surface>
      </section>

      {holidays.length > 0 ? (
        <section>
          <SectionHeading>Public holidays</SectionHeading>
          <p className={styles.hint}>
            Derived from the Bundesland setting above — not editable here.
          </p>
          <ul className={styles.holidayList}>
            {holidays.map((holiday) => (
              <li key={holiday.id}>
                <Surface variant="sunken" className={styles.holidayRow}>
                  <div className={styles.holidayText}>
                    <p className={styles.holidayDate}>{formatDate(holiday.date)}</p>
                    {holiday.reason ? <p className={styles.holidayName}>{holiday.reason}</p> : null}
                  </div>
                </Surface>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ActionBar>
        <Button variant="primary" fullWidth isDisabled={pending} onPress={submitPattern}>
          Save changes
        </Button>
      </ActionBar>
    </div>
  );
}
