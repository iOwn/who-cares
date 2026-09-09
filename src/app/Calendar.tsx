"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  Absence,
  Assignment,
  CalendarDate,
  ChildcarePattern,
  Closure,
  Member,
  PickupRequest,
} from "@/domain";
import {
  buildCalendarMonth,
  CalendarGrid,
  EmptyState,
  FAB,
  isStatusDisplayState,
  Legend,
  MonthPager,
  monthOf,
  SegmentedControl,
  StatePill,
  shiftMonth,
} from "@/ui";
import { AbsenceForm } from "./AbsenceForm";
import styles from "./Calendar.module.css";
import { DayDetail } from "./DayDetail";

/**
 * The calendar feature (#49, #50) — the calendar-first landing screen. A `'use
 * client'` component that owns the paging + Grid/List tab state + the
 * day-detail modal; the RSC above it (`page.tsx`) loads the effective-dated
 * pattern, closures, and (with #51) the assignments / requests / absences, and
 * the derivation runs in `buildCalendarMonth` (`@/ui`, the framework-free
 * service + mapper). No domain logic lives here (ADR-0005).
 *
 * Day state (#50) is derived live for every cell; until #51 persists any
 * assignments / requests / absences those inputs are empty, so childcare days
 * still render `quiet`.
 */

export interface CalendarProps {
  /** The signed-in member — the one an absence declared from here belongs to. */
  readonly currentMemberId: string;
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  readonly assignments?: readonly Assignment[];
  readonly pickupRequests?: readonly PickupRequest[];
  readonly absences?: readonly Absence[];
  readonly members?: readonly Member[];
  /** The real current date as the server saw it (`'YYYY-MM-DD'`, UTC). */
  readonly initialToday: CalendarDate;
  /**
   * The real current instant as the server saw it (ISO). Drives the ADR-0003
   * 48h threshold math; corrected to the client clock after mount, same as
   * `initialToday`, so the first paint matches server HTML exactly.
   */
  readonly initialNow: string;
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

export function Calendar({
  currentMemberId,
  pattern,
  closures,
  assignments,
  pickupRequests,
  absences,
  members,
  initialToday,
  initialNow,
}: CalendarProps) {
  // Start from the server's date/instant to keep the first paint stable, then
  // correct to the viewer's local clock once mounted (an effect — no mismatch).
  const [today, setToday] = useState<CalendarDate>(initialToday);
  const [now, setNow] = useState(() => new Date(initialNow));
  const [{ year, month }, setMonth] = useState(() => monthOf(initialToday));
  const [tab, setTab] = useState<Tab>("grid");
  const [selectedDate, setSelectedDate] = useState<CalendarDate | null>(null);
  // `null` = the "I'm out" sheet is closed; otherwise the day it is anchored to.
  const [absenceAnchor, setAbsenceAnchor] = useState<CalendarDate | null>(null);

  useEffect(() => {
    const sync = () => {
      setNow(new Date());
      const local = localTodayIso();
      setToday((prev) => (prev === local ? prev : local));
    };
    sync();
    // Day state is derived live (ADR-0003); re-sample the clock whenever the tab
    // comes back into view so a long-lived PWA tab doesn't sit on a stale
    // Pending day past its 48h threshold. `today` only moves the grid when the
    // browsed month still tracks it — handled below.
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", sync);
    };
  }, []);

  // Follow the real date onto the grid only while the user hasn't paged away
  // from it (first mount, or they're sitting on "this month").
  const initialMonth = useMemo(() => monthOf(initialToday), [initialToday]);
  useEffect(() => {
    setMonth((prev) =>
      prev.year === initialMonth.year && prev.month === initialMonth.month ? monthOf(today) : prev,
    );
  }, [today, initialMonth]);

  const view = useMemo(
    () =>
      buildCalendarMonth({
        year,
        month,
        pattern,
        closures,
        assignments,
        pickupRequests,
        absences,
        members,
        today,
        now,
      }),
    [year, month, pattern, closures, assignments, pickupRequests, absences, members, today, now],
  );

  const selectedDay = useMemo(
    () =>
      selectedDate == null
        ? null
        : (view.weeks.flat().find((day) => day.date === selectedDate) ?? null),
    [selectedDate, view],
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
          <CalendarGrid month={view} onDayPress={setSelectedDate} />
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
                  {/* TODO(#83): ListRow primitive — this hand-rolls Surface's
                      sunken treatment because Surface has no `as` prop. */}
                  <button
                    type="button"
                    className={styles.listRow}
                    onClick={() => setSelectedDate(day.date)}
                  >
                    <span className={styles.listRowText}>
                      <span className={styles.listDate}>{formatDayShort(day.date)}</span>
                      <span className={styles.listLine}>{day.narrative}</span>
                    </span>
                    {isStatusDisplayState(day.displayState) ? (
                      <StatePill state={day.displayState} size="sm" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={styles.fab}>
        <FAB
          icon={Plus}
          // The FAB always anchors to the real today, never the browsed month
          // (SPEC.md "Navigation").
          onPress={() => setAbsenceAnchor(today)}
        >
          I&rsquo;m out
        </FAB>
      </div>

      <DayDetail
        day={selectedDay}
        onOpenChange={(open) => !open && setSelectedDate(null)}
        onDeclareAbsence={(date) => {
          setSelectedDate(null);
          setAbsenceAnchor(date);
        }}
      />

      {absenceAnchor != null ? (
        <AbsenceForm
          isOpen
          anchorDate={absenceAnchor}
          onOpenChange={(open) => !open && setAbsenceAnchor(null)}
          today={today}
          currentMemberId={currentMemberId}
          members={members ?? []}
          pattern={pattern}
          closures={closures}
          absences={absences ?? []}
          assignments={assignments ?? []}
          pickupRequests={pickupRequests ?? []}
        />
      ) : null}
    </div>
  );
}
