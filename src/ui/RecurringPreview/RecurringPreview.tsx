import { forwardRef } from "react";
import { Callout, type CalloutProps } from "../Callout";

/**
 * `RecurringPreview` — the Recurring-tab counterpart of `AbsenceImpact`
 * (docs/design-system-inventory.md P1; issue #54). A thin `Callout tone="info"`
 * wrapper that turns the counts the feature derives (from `planRecurringAbsences`,
 * `@/domain`) into the plain-language "creates N absences, M already covered"
 * line the Recurring form shows before submit.
 *
 * Counts only — the feature owns the derivation; this owns the copy.
 */
export interface RecurringPreviewProps
  extends Omit<CalloutProps, "children" | "title" | "tone" | "dot" | "icon"> {
  /** One-day absences that would be created (uncovered matching weekdays). */
  toCreate: number;
  /** Matching weekdays already inside an existing absence — silently skipped. */
  alreadyCovered: number;
  /** The picked end date was past the 4-week-from-today cap and was trimmed. */
  capped: boolean;
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export function recurringPreviewLine(
  toCreate: number,
  alreadyCovered: number,
  capped: boolean,
): string {
  const trimmed = capped ? " Dates past four weeks from today were trimmed off." : "";

  if (toCreate === 0) {
    if (alreadyCovered === 0) {
      return `Pick weekdays and a date range to preview.${trimmed}`;
    }
    return `Every matching day is already covered — nothing new to add.${trimmed}`;
  }

  const covered =
    alreadyCovered > 0 ? ` ${plural(alreadyCovered, "day")} already covered were skipped.` : "";
  return `Creates ${plural(toCreate, "one-day absence")}.${covered}${trimmed}`;
}

export const RecurringPreview = forwardRef<HTMLDivElement, RecurringPreviewProps>(
  function RecurringPreview({ toCreate, alreadyCovered, capped, ...props }, ref) {
    return (
      <Callout {...props} ref={ref} tone="info" dot>
        {recurringPreviewLine(toCreate, alreadyCovered, capped)}
      </Callout>
    );
  },
);
