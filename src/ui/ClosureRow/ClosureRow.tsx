import { Trash2 } from "lucide-react";
import { Button } from "../Button";
import { cx } from "../cx";
import { Surface } from "../Surface";
import styles from "./ClosureRow.module.css";

/**
 * `ClosureRow` — one Settings closure-list item (docs/design-system-inventory.md,
 * P1): a `Surface` holding the date (range) title, an optional "N days" line,
 * the free-text reason, the care-kind line, and Edit / Remove actions.
 *
 * One row per *range* of consecutive same-kind/reason closures (issue #171);
 * the feature groups and formats — this component only lays out what it is
 * given. Wrap in an `<li>` (`Surface` has no `as`).
 */
export interface ClosureRowProps {
  /** The formatted date or date range. */
  title: string;
  /** Days covered; a "N days" line shows when greater than 1. */
  dayCount?: number;
  /** Free-text closure reason, shown verbatim when present. */
  reason?: string;
  /** Care-kind line, e.g. "Care at home". */
  kind: string;
  onEdit: () => void;
  onRemove: () => void;
  isRemoveDisabled?: boolean;
  /** Accessible name for Remove when the visible label alone is ambiguous (ranges). */
  removeLabel?: string;
  className?: string;
}

export function ClosureRow({
  title,
  dayCount = 1,
  reason,
  kind,
  onEdit,
  onRemove,
  isRemoveDisabled,
  removeLabel,
  className,
}: ClosureRowProps) {
  return (
    <Surface className={cx(styles.row, className)}>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {dayCount > 1 ? <p className={styles.meta}>{dayCount} days</p> : null}
        {reason ? <p className={styles.meta}>{reason}</p> : null}
        <p className={styles.kind}>{kind}</p>
      </div>
      <Button variant="ghost" size="sm" onPress={onEdit}>
        Edit
      </Button>
      <Button
        variant="ghost"
        tone="danger"
        size="sm"
        isDisabled={isRemoveDisabled}
        aria-label={removeLabel}
        onPress={onRemove}
      >
        <Trash2 size={14} aria-hidden /> Remove
      </Button>
    </Surface>
  );
}
