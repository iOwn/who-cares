"use client";

import { useState, useTransition } from "react";
import { setHideWeekendsAction } from "@/app/preferenceActions";
import { announce, SegmentedControl, Surface } from "@/ui";
import styles from "./SettingsScreen.module.css";

type Choice = "show" | "hide";

interface Props {
  /** The preference as the server read it out of this browser's cookie. */
  readonly hideWeekends: boolean;
}

/**
 * "Weekend days" (issue #130) — show or hide Saturday and Sunday in the
 * calendar Grid.
 *
 * The preference is a cookie, not a row: it belongs to this browser, so one
 * parent narrowing their calendar never narrows the other's (see
 * `@/app/calendarPreferences` for why a cookie and not a column). The
 * `SegmentedControl` is optimistic — the action only writes a cookie and
 * revalidates, so there is nothing to fail in a way the parent needs to hear
 * about, and the Grid behind Settings is already re-rendered by the time they
 * navigate back.
 *
 * Hiding is a *request*, not a guarantee: a month whose childcare pattern
 * covers a Saturday keeps that column (`buildCalendarMonth`). The copy says so
 * rather than letting the parent think the setting is broken.
 */
export function WeekendDaysCard({ hideWeekends }: Props) {
  const [choice, setChoice] = useState<Choice>(hideWeekends ? "hide" : "show");
  const [, startTransition] = useTransition();

  const onChange = (value: string) => {
    const next = value === "hide" ? "hide" : "show";
    setChoice(next);
    announce(
      next === "hide"
        ? "Weekend days are hidden from the calendar grid."
        : "Weekend days are shown in the calendar grid.",
    );
    startTransition(() => setHideWeekendsAction(next === "hide"));
  };

  return (
    <Surface className={styles.card}>
      <div className={styles.cardText}>
        <p className={styles.cardTitle}>Weekend days</p>
        <p className={styles.cardBody}>
          Hide Saturday and Sunday to give the weekdays more room in the calendar grid. This is just
          for this browser — it doesn’t change what the other parent sees. A weekend that actually
          has childcare, or a closure, stays on the grid either way.
        </p>
      </div>

      <SegmentedControl aria-label="Weekend days" value={choice} onChange={onChange}>
        <SegmentedControl.Item value="show">Show</SegmentedControl.Item>
        <SegmentedControl.Item value="hide">Hide</SegmentedControl.Item>
      </SegmentedControl>
    </Surface>
  );
}
