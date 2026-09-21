import { cx } from "@/ui/cx";
import { VisuallyHidden } from "@/ui/VisuallyHidden";
import styles from "./RouteSkeleton.module.css";

/**
 * The two route loading skeletons (issue #144), rendered by `loading.tsx`
 * next to each page. A `loading.tsx` turns a dynamic route into one Next can
 * prefetch (layout to the loading boundary) and swaps in on the tap — before
 * this, nothing changed on screen until the server had rendered the whole
 * page. Both are plain Server Components: only decorative blocks, one
 * `role="status"` for assistive tech. Shapes track the real screens so the
 * swap to content does not jump. The calendar one stands in for a whole
 * screen; the settings one only for the body under a layout that stays put.
 */

const CALENDAR_CELLS = Array.from({ length: 35 }, (_, i) => i);

function Block({ className }: { className: string }) {
  return <div className={cx(styles.block, className)} aria-hidden />;
}

/** `/` — the app header's wordmark plus a calendar-shaped body. */
export function CalendarSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <VisuallyHidden>Loading calendar</VisuallyHidden>
      <header className={styles.header} aria-hidden>
        <div className={styles.headerText}>
          <p className={styles.wordmark}>WhoCares</p>
          <Block className={styles.textSm} />
        </div>
        <div className={styles.headerActions}>
          <Block className={styles.icon} />
          <Block className={styles.icon} />
        </div>
      </header>
      <main className={styles.calendar} aria-hidden>
        <Block className={styles.tabs} />
        <div className={styles.pager}>
          <Block className={styles.icon} />
          <Block className={styles.monthLabel} />
          <Block className={styles.icon} />
        </div>
        <div className={styles.grid}>
          {CALENDAR_CELLS.map((i) => (
            <Block key={i} className={styles.cell} />
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * Both Settings tabs (`/settings`, `/settings/household`) — body only. The
 * route header and the You / Household switch belong to `settings/layout.tsx`
 * (issue #143), which stays mounted across the tabs, so they never need a
 * stand-in. The one `settings/loading.tsx` covers both pages, hence the card
 * count is a compromise between the personal tab's four sections and the
 * household tab's two.
 */
const SETTINGS_SECTIONS = ["first", "second", "third"];

export function SettingsSkeleton() {
  return (
    <div role="status" aria-busy="true" className={styles.settings}>
      <VisuallyHidden>Loading settings</VisuallyHidden>
      {SETTINGS_SECTIONS.map((key) => (
        <section key={key} className={styles.section} aria-hidden>
          <Block className={styles.heading} />
          <Block className={cx(styles.card, styles.settingsCard)} />
        </section>
      ))}
    </div>
  );
}
