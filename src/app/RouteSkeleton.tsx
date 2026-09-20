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
 * swap to content does not jump.
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
      <header className={styles.header}>
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

const SETTINGS_SECTIONS = ["passkey", "devices", "push", "calendar", "childcare"];

/** `/settings` — the route header's frame plus one card per section. */
export function SettingsSkeleton() {
  return (
    <div role="status" aria-busy="true" className={styles.settingsBase}>
      <VisuallyHidden>Loading settings</VisuallyHidden>
      <header className={styles.header}>
        <Block className={styles.icon} />
        <div className={styles.headerText}>
          <Block className={styles.text} />
        </div>
      </header>
      <main className={styles.settings} aria-hidden>
        {SETTINGS_SECTIONS.map((key) => (
          <section key={key} className={styles.section}>
            <Block className={styles.heading} />
            <Block className={cx(styles.card, styles.settingsCard)} />
          </section>
        ))}
      </main>
    </div>
  );
}
