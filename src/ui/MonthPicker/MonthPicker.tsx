"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../Button";
import { mq } from "../breakpoints";
import { cx } from "../cx";
import { Dialog } from "../Dialog";
import { IconButton } from "../IconButton";
import styles from "./MonthPicker.module.css";

/**
 * `MonthPicker` — the jump-to-month body (docs/design-system-inventory.md, P1):
 * a year stepper + a 12-month grid inside a `Dialog`. Rendered as the overlay
 * child of a `DialogTrigger` (see `MonthPager`).
 *
 * `presentation` follows the design: a bottom `sheet` on mobile, a centred card
 * on desktop (`--bp-md`). No year-at-a-glance view — SPEC.md.
 *
 * `'use client'` — it imports RAC (via `Dialog`) and holds the displayed-year
 * state.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface MonthPickerProps {
  /** The currently-shown month, 1–12 — highlighted, and the year the picker opens on. */
  month: number;
  /** The currently-shown year. */
  year: number;
  /** Called with the chosen `(year, month)`. The dialog closes itself afterwards. */
  onSelect: (year: number, month: number) => void;
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(mq.md);
    const update = () => setDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function MonthPicker({ month, year, onSelect }: MonthPickerProps) {
  const [viewYear, setViewYear] = useState(year);
  const desktop = useIsDesktop();

  return (
    <Dialog presentation={desktop ? "center" : "sheet"} aria-label="Jump to month">
      {({ close }) => (
        <>
          <Dialog.Header
            title="Jump to month"
            trailing={
              <Button variant="ghost" size="sm" onPress={close}>
                Done
              </Button>
            }
          />
          <div className={styles.body}>
            <div className={styles.yearRow}>
              <IconButton
                aria-label="Previous year"
                variant="ghost"
                size="sm"
                onPress={() => setViewYear((y) => y - 1)}
              >
                <ChevronLeft size={18} aria-hidden />
              </IconButton>
              <span className={styles.year}>{viewYear}</span>
              <IconButton
                aria-label="Next year"
                variant="ghost"
                size="sm"
                onPress={() => setViewYear((y) => y + 1)}
              >
                <ChevronRight size={18} aria-hidden />
              </IconButton>
            </div>
            <div className={styles.grid}>
              {MONTHS.map((name, index) => {
                const monthNumber = index + 1;
                const current = viewYear === year && monthNumber === month;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={current}
                    className={cx(styles.month, current && styles.monthCurrent)}
                    onClick={() => {
                      onSelect(viewYear, monthNumber);
                      close();
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}
