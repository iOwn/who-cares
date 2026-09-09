"use client";

import { X } from "lucide-react";
import type { CalendarDate } from "@/domain";
import type { CalendarDayView } from "@/ui";
import { Button, Dialog, IconButton, isStatusDisplayState, StatePill } from "@/ui";
import styles from "./DayDetail.module.css";
import { longDate } from "./formatCalendarDate";

/**
 * `DayDetail` (the design-system's `DayDetailSheet`, #50) — the modal that opens
 * over the grid when a day cell is pressed. It is a read-only summary in v1:
 * the day's state dot + label + a plain-language narrative line, plus the
 * closure's free-text reason when the day is `closed` (SPEC.md "Day-state
 * encoding"; docs/design-system.md "Closed affordance").
 *
 * Everything it shows comes off the already-derived `CalendarDayView` — the
 * live Day state is computed once in `buildCalendarMonth`, never again here.
 * The pickup actions (accept / decline / claim) that will live in this sheet
 * arrive with #52 / #53.
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
}

/** Neutral label for the two non-status display states the `StatePill` can't speak. */
const NEUTRAL_LABEL: Record<"quiet" | "off", string> = {
  quiet: "Quiet day",
  off: "No childcare",
};

export function DayDetail({ day, onOpenChange, onDeclareAbsence }: DayDetailProps) {
  return (
    <Dialog presentation="sheet" isOpen={day != null} onOpenChange={onOpenChange}>
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
            {onDeclareAbsence && day.displayState !== "off" ? (
              <div className={styles.actions}>
                <Button variant="secondary" size="sm" onPress={() => onDeclareAbsence(day.date)}>
                  I&rsquo;m out this day
                </Button>
              </div>
            ) : null}
          </div>
        )
      }
    </Dialog>
  );
}
