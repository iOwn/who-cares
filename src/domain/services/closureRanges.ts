import { type CalendarDate, type Closure, closureNeedsCover } from "../types";

/**
 * A run of stored closures the Settings list presents as one row (issue #171).
 * Presentation only — storage stays one `Closure` row per date (CONTEXT.md).
 */
export interface ClosureRange {
  /** Ids of every stored row in the run, chronological. */
  readonly ids: readonly string[];
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  /** Stored days in the run (a Fri→Mon bridge counts 2, not 4). */
  readonly dayCount: number;
  readonly reason?: string;
  readonly needsCover: boolean;
}

const DAY_MS = 86_400_000;

function utcMs(date: CalendarDate): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

/**
 * `true` iff `next` follows `prev` with no childcare-relevant day between: the
 * next calendar day, or Monday after a Friday (a Mon–Fri week is stored without
 * its weekend, and weekends are not childcare days).
 */
function isConsecutive(prev: CalendarDate, next: CalendarDate): boolean {
  const gapDays = Math.round((utcMs(next) - utcMs(prev)) / DAY_MS);
  return gapDays === 1 || (gapDays === 3 && new Date(utcMs(prev)).getUTCDay() === 5);
}

/**
 * Collapse consecutive closures of the same kind and the same (trimmed) reason
 * into one range, so a closure entered as a range comes back as one. The data
 * cannot tell one range from two touching ones, and they mean the same thing.
 * Input order doesn't matter; output is chronological.
 */
export function groupClosureRanges(closures: readonly Closure[]): ClosureRange[] {
  const sorted = [...closures].sort((a, b) => a.date.localeCompare(b.date));
  const ranges: ClosureRange[] = [];
  let current:
    | ({ ids: string[]; startDate: string; endDate: string } & {
        reason?: string;
        needsCover: boolean;
      })
    | null = null;

  const flush = () => {
    if (!current) return;
    ranges.push({ ...current, dayCount: current.ids.length });
    current = null;
  };

  for (const closure of sorted) {
    const reason = closure.reason?.trim() || undefined;
    const needsCover = closureNeedsCover(closure);
    if (
      current &&
      current.needsCover === needsCover &&
      current.reason === reason &&
      isConsecutive(current.endDate, closure.date)
    ) {
      current.ids.push(closure.id);
      current.endDate = closure.date;
      continue;
    }
    flush();
    current = {
      ids: [closure.id],
      startDate: closure.date,
      endDate: closure.date,
      ...(reason ? { reason } : {}),
      needsCover,
    };
  }
  flush();
  return ranges;
}
