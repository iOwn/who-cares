import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Avatar } from "../Avatar";
import { cx } from "../cx";
import { requestTimingLine } from "../relativeTime";
import { StatePill } from "../StatePill";
import { Surface } from "../Surface";
import styles from "./RequestCard.module.css";

/**
 * `RequestCard` — one pickup request in the inbox
 * (docs/design-system-inventory.md P1). Composes `Surface` + `Avatar` + the
 * "{name} is out · {date}" line + a plain, factual timing line + an optional
 * action row.
 *
 * `escalating` is the sub-variant for a request that has crossed an ADR-0003
 * 48h threshold: `Surface variant="danger"` + an "At risk" pill + the plainly
 * stated timing line (still never urgency-toned — SPEC.md "Notifications").
 *
 * The Accept / Decline controls are passed in as `actions` — the request
 * lifecycle (#52) owns those handlers; #51 renders the card read-only.
 * A plain `<article>`; no RAC, no `'use client'`.
 */
export interface RequestCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** The absent parent who raised the request. */
  requesterName: string;
  /** The childcare day the request is about, pre-formatted for display. */
  dateLabel: string;
  /** When the request was raised — drives the timing line. */
  raisedAt: Date;
  /** "Now", for the timing line. Defaults to `new Date()`. */
  now?: Date;
  /** `true` once the request has crossed a 48h threshold (ADR-0003). */
  escalating?: boolean;
  /** Accept / Decline controls, supplied by the request-lifecycle feature (#52). */
  actions?: ReactNode;
}

export const RequestCard = forwardRef<HTMLDivElement, RequestCardProps>(function RequestCard(
  {
    requesterName,
    dateLabel,
    raisedAt,
    now = new Date(),
    escalating,
    actions,
    className,
    ...props
  },
  ref,
) {
  return (
    <Surface
      {...props}
      ref={ref}
      variant={escalating ? "danger" : "default"}
      className={cx(styles.base, className)}
    >
      <article className={styles.inner}>
        <div className={styles.head}>
          <Avatar name={requesterName} size="sm" aria-hidden />
          <div className={styles.headText}>
            <p className={styles.title}>
              {requesterName} is out · {dateLabel}
            </p>
            <p className={styles.timing}>{requestTimingLine(raisedAt, now, Boolean(escalating))}</p>
          </div>
          {escalating ? <StatePill state="at-risk" size="sm" /> : null}
        </div>
        <p className={styles.question}>Can you cover this pickup?</p>
        {actions != null ? <div className={styles.actions}>{actions}</div> : null}
      </article>
    </Surface>
  );
});
