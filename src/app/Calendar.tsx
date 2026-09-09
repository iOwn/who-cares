"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CalendarDate, ChildcarePattern, Closure } from "@/domain";
import {
  buildCalendarMonth,
  CalendarGrid,
  EmptyState,
  FAB,
  Legend,
  MonthPager,
  monthOf,
  SegmentedControl,
  StatePill,
  Surface,
  shiftMonth,
} from "@/ui";
import styles from "./Calendar.module.css";

/**
 * The calendar feature (#49) — the calendar-first landing screen. A `'use
 * client'` component that owns the paging + Grid/List tab state; the RSC above
 * it (`page.tsx`) loads the effective-dated pattern + closures and the
 * derivation runs in `buildCalendarMonth` (`@/ui`, the framework-free service +
 * mapper). No domain logic lives here (ADR-0005).
 *
 * Day-state (#50) does not exist yet, so every childcare day renders `quiet`,
 * non-pattern weekdays `off`, and closures `closed` with a generic line — which
 * is why the List view is usually near-empty.
 */

export interface CalendarProps {
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  /** The real current date as the server saw it (`'YYYY-MM-DD'`, UTC). */
  readonly initialToday: CalendarDate;
}

type Tab = "grid" | "list";

function localTodayIso(): CalendarDate {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function formatDayShort(date: CalendarDate): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function Calendar({ pattern, closures, initialToday }: CalendarProps) {
  // Start from the server's date to keep the first paint stable, then correct to
  // the viewer's local date once mounted (no hydration mismatch — it's an effect).
  const [today, setToday] = useState<CalendarDate>(initialToday);
  const [{ year, month }, setMonth] = useState(() => monthOf(initialToday));
  const [tab, setTab] = useState<Tab>("grid");

  useEffect(() => {
    const local = localTodayIso();
    if (local !== initialToday) {
      setToday(local);
      setMonth(monthOf(local));
    }
  }, [initialToday]);

  const view = useMemo(
    () => buildCalendarMonth({ year, month, pattern, closures, today }),
    [year, month, pattern, closures, today],
  );

  const goToday = () => setMonth(monthOf(today));

  return (
    <div className={styles.root}>
      <MonthPager
        year={year}
        month={month}
        onPrev={() => setMonth(shiftMonth(year, month, -1))}
        onNext={() => setMonth(shiftMonth(year, month, 1))}
        onToday={goToday}
        onJump={(y, m) => setMonth({ year: y, month: m })}
      />

      <SegmentedControl
        aria-label="Calendar view"
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        className={styles.tabs}
      >
        <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
        <SegmentedControl.Item value="list">List</SegmentedControl.Item>
      </SegmentedControl>

      {tab === "grid" ? (
        <>
          <Legend className={styles.legend} />
          <CalendarGrid month={view} />
        </>
      ) : (
        <div className={styles.list}>
          <p className={styles.listHint}>
            Only days worth a look — quiet days and weekends hidden.
          </p>
          {view.notableDays.length === 0 ? (
            <EmptyState
              title="Nothing notable this month"
              description="Closures and days that need someone will show up here."
            />
          ) : (
            <ul className={styles.listRows}>
              {view.notableDays.map((day) => (
                <li key={day.date}>
                  <Surface variant="sunken" className={styles.listRow}>
                    <div>
                      <p className={styles.listDate}>{formatDayShort(day.date)}</p>
                      <p className={styles.listLine}>Daycare closed — no pickup needed.</p>
                    </div>
                    {day.displayState === "closed" ? <StatePill state="closed" size="sm" /> : null}
                  </Surface>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={styles.fab}>
        <FAB
          icon={Plus}
          // Absence entry (the "I'm out" sheet) lands in #51 — it always
          // defaults to the real today, never the browsed month.
          onPress={() => {}}
        >
          I&rsquo;m out
        </FAB>
      </div>
    </div>
  );
}
