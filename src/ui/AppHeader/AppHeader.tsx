"use client";

import { Bell } from "lucide-react";
import { forwardRef, type HTMLAttributes } from "react";
import { CountBadge } from "../CountBadge";
import { cx } from "../cx";
import { IconButton } from "../IconButton";
import styles from "./AppHeader.module.css";

/**
 * `AppHeader` — the top-of-app wordmark + child subtitle + requests bell
 * (docs/design-system-inventory.md §18). Its own primitive — no generic
 * `TopBar` (docs/design-system.md "Component inventory" decisions). Shown on
 * Main / List.
 *
 * A `<header>` landmark, sticky at `--z-sticky` (tokens.css: "app header").
 * This file has no RAC import of its own, but carries `'use client'` because
 * it wires `onOpenRequests` directly onto the composed `IconButton`'s
 * `onPress`. `CountBadge` renders nothing at `requestCount <= 0`.
 */
export interface AppHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** The active child's name — rendered `"{childName} · who's on pickup"`. */
  childName: string;
  /** Pending-request count, surfaced on the bell's `CountBadge`. */
  requestCount: number;
  /** Called when the bell is pressed — opens the requests inbox. */
  onOpenRequests: () => void;
}

export const AppHeader = forwardRef<HTMLElement, AppHeaderProps>(function AppHeader(
  { childName, requestCount, onOpenRequests, className, style, ...props },
  ref,
) {
  return (
    <header {...props} ref={ref} className={cx(styles.base, className)} style={style}>
      <div className={styles.text}>
        <p className={styles.wordmark}>WhoCares</p>
        <p className={styles.subtitle}>{childName} · who&rsquo;s on pickup</p>
      </div>
      <div className={styles.bellSlot}>
        <IconButton aria-label="Requests" variant="ghost" onPress={onOpenRequests}>
          <Bell size={20} aria-hidden />
        </IconButton>
        <CountBadge count={requestCount} className={styles.badge} aria-hidden />
      </div>
    </header>
  );
});
