"use client";

import { ArrowLeft } from "lucide-react";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "../cx";
import { IconButton } from "../IconButton";
import styles from "./RouteHeader.module.css";

/**
 * `RouteHeader` — back `IconButton` + title (docs/design-system-inventory.md
 * §19). Its own primitive — no generic `TopBar`. Used on sub-routes: Inbox
 * ("Requests"), Settings ("Carlito's childcare").
 *
 * A `<header>` landmark with the route's `<h1>`, sticky at `--z-sticky`. No
 * RAC import of its own — carries `'use client'` because it wires `onBack`
 * directly onto the composed `IconButton`'s `onPress`.
 */
export interface RouteHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "children" | "title"> {
  /** The route's title. */
  title: ReactNode;
  /** Called when the back control is pressed. */
  onBack: () => void;
  /** An optional trailing slot (e.g. an action button). */
  trailing?: ReactNode;
}

export const RouteHeader = forwardRef<HTMLElement, RouteHeaderProps>(function RouteHeader(
  { title, onBack, trailing, className, style, ...props },
  ref,
) {
  return (
    <header {...props} ref={ref} className={cx(styles.base, className)} style={style}>
      <IconButton aria-label="Back" variant="ghost" onPress={onBack}>
        <ArrowLeft size={20} aria-hidden />
      </IconButton>
      <h1 className={styles.title}>{title}</h1>
      {trailing != null && <div className={styles.trailing}>{trailing}</div>}
    </header>
  );
});
