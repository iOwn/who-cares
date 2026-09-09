"use client";

import { type DateValue, parseDate } from "@internationalized/date";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CalendarDate, ChildcarePattern, Closure, Weekday } from "@/domain";
import { resolvePatternVersion } from "@/domain";
import {
  ActionBar,
  Button,
  Callout,
  DateField,
  SectionHeading,
  Surface,
  TextField,
  WeekdayPicker,
} from "@/ui";
import styles from "./ChildcareSettings.module.css";
import { removeClosureAction, saveClosureAction, savePatternAction } from "./childcareActions";

/**
 * The childcare-settings feature (#49) — set the effective-dated pattern and
 * manage closures. A `'use client'` form over thin Server Actions
 * (`./childcareActions`); no domain logic here (ADR-0005). Rendered as a
 * section inside `SettingsScreen` (issue #48 owns the route shell + header).
 */

export interface ChildcareSettingsProps {
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  /** `'YYYY-MM-DD'` (the server's today) — the default "effective from" date. */
  readonly today: CalendarDate;
}

function iso(value: DateValue | null): CalendarDate | null {
  return value ? value.toString() : null;
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

export function ChildcareSettings({ pattern, closures, today }: ChildcareSettingsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // The pattern editor is seeded from the version currently in effect.
  const currentWeekdays = (resolvePatternVersion(pattern, today)?.weekdays ?? []) as Weekday[];
  const [weekdays, setWeekdays] = useState<Weekday[]>([...currentWeekdays]);
  const [effectiveFrom, setEffectiveFrom] = useState<DateValue | null>(() => parseDate(today));

  // Closures.
  const [closureDate, setClosureDate] = useState<DateValue | null>(null);
  const [closureReason, setClosureReason] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const run = (work: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await work();
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

  const submitClosure = () => {
    const date = iso(closureDate);
    if (!date) return setError("Pick the closure date");
    run(async () => {
      await saveClosureAction({
        ...(editingId ? { id: editingId } : {}),
        date,
        reason: closureReason,
      });
      setClosureDate(null);
      setClosureReason("");
      setEditingId(null);
    });
  };

  const editClosure = (closure: Closure) => {
    setEditingId(closure.id);
    setClosureDate(parseDate(closure.date));
    setClosureReason(closure.reason ?? "");
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
        {closures.length === 0 ? (
          <p className={styles.hint}>No closures yet.</p>
        ) : (
          <ul className={styles.closureList}>
            {closures.map((closure) => (
              <li key={closure.id}>
                <Surface className={styles.closureRow}>
                  <div className={styles.closureText}>
                    <p className={styles.closureDate}>{formatDate(closure.date)}</p>
                    {closure.reason ? (
                      <p className={styles.closureReason}>{closure.reason}</p>
                    ) : null}
                  </div>
                  <Button variant="ghost" size="sm" onPress={() => editClosure(closure)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    tone="danger"
                    size="sm"
                    isDisabled={pending}
                    onPress={() => run(() => removeClosureAction(closure.id))}
                  >
                    <Trash2 size={14} aria-hidden /> Remove
                  </Button>
                </Surface>
              </li>
            ))}
          </ul>
        )}

        <Surface variant="sunken" className={styles.closureForm}>
          <p className={styles.closureFormTitle}>{editingId ? "Edit closure" : "Add a closure"}</p>
          <DateField
            label="Date"
            value={closureDate}
            onChange={setClosureDate}
            className={styles.field}
          />
          <TextField
            label="Reason"
            isOptional
            value={closureReason}
            onChange={setClosureReason}
            placeholder="e.g. Staff training day"
            className={styles.field}
          />
          <div className={styles.closureFormActions}>
            {editingId ? (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setEditingId(null);
                  setClosureDate(null);
                  setClosureReason("");
                }}
              >
                Cancel
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" isDisabled={pending} onPress={submitClosure}>
              {editingId ? "Save closure" : "Add closure"}
            </Button>
          </div>
        </Surface>
      </section>

      <ActionBar>
        <Button variant="primary" fullWidth isDisabled={pending} onPress={submitPattern}>
          Save changes
        </Button>
      </ActionBar>
    </div>
  );
}
