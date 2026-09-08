import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentType, forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Callout.module.css";

/**
 * `Callout` — the one unified panel (docs/design-system-inventory.md §8, and the
 * "Callout worked example" in docs/design-system.md). It covers the at-risk
 * nudge, the "I'm out" impact panel, the recurring-absence preview, and the
 * top-of-form submit error. P1 `AbsenceImpact` / `RecurringPreview` are thin
 * wrappers over it.
 *
 * WORKED-EXAMPLE NOTES — the pattern the rest of the non-interactive primitives
 * follow by analogy:
 *
 *   - `tone` RECOLOURS via `cva` → imported CSS-Module class refs
 *     (`styles.danger`), never string literals. There is no `variant` axis and
 *     no `size` axis — `tone` is the whole surface.
 *   - NO interaction state: a `Callout` is not focusable, not pressable, not
 *     dismissable in v1. There is nothing in `Callout.module.css` selecting a
 *     `[data-*]` attribute, and no press recipe.
 *   - the slot layout is fixed: an optional leading marker (`icon` component OR
 *     `dot`), then a body column of optional `title` / `children` / `action` /
 *     `footnote`. Each slot renders only when supplied.
 *   - `className` / `style` are forwarded and merged LAST; `ref` forwards to the
 *     root `<div>`.
 *   - it sets no ARIA `role` of its own. For the submit-error use, the feature
 *     passes `role="alert"` (or `aria-live`) through — the library does not
 *     decide urgency for it.
 */
const callout = cva(styles.base, {
  variants: {
    tone: {
      danger: styles.danger,
      info: styles.info,
      neutral: styles.neutral,
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

type IconComponent = ComponentType<{
  size?: number | string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface CalloutProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "children">,
    VariantProps<typeof callout> {
  /** Leading icon COMPONENT (`icon={Info}`), not an element. Ignored when `dot` is set. */
  icon?: IconComponent;
  /** Show a tone-coloured dot as the leading marker instead of an icon. */
  dot?: boolean;
  /** Optional heading line, in the display face. */
  title?: ReactNode;
  /** The body copy. */
  children?: ReactNode;
  /** An action affordance (a `Button`, a link) under the body. */
  action?: ReactNode;
  /** A de-emphasised line under the body / action. */
  footnote?: ReactNode;
}

export const Callout = forwardRef<HTMLDivElement, CalloutProps>(function Callout(
  { tone, icon: Icon, dot, title, children, action, footnote, className, style, ...props },
  ref,
) {
  const marker = dot ? (
    <span className={styles.marker} aria-hidden>
      <span className={styles.dot} />
    </span>
  ) : Icon ? (
    <span className={styles.marker} aria-hidden>
      <Icon size={18} aria-hidden />
    </span>
  ) : null;

  return (
    <div {...props} ref={ref} className={cx(callout({ tone }), className)} style={style}>
      {marker}
      <div className={styles.body}>
        {title != null && <p className={styles.title}>{title}</p>}
        {children != null && <div className={styles.content}>{children}</div>}
        {action != null && <div className={styles.action}>{action}</div>}
        {footnote != null && <p className={styles.footnote}>{footnote}</p>}
      </div>
    </div>
  );
});
