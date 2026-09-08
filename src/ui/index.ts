/**
 * The `src/ui/` barrel — path alias `@/ui`.
 *
 * A PLAIN re-export barrel with NO `'use client'` of its own: the directive
 * rides on each component file that imports RAC (`Button`, `IconButton`, `FAB`).
 * A Server Component that hits a client-boundary complaint importing from here
 * should deep-import the specific primitive (`@/ui/Surface`) instead.
 *
 * `tokens.css` / `mixins.css` are global stylesheets imported once in the root
 * layout (and the Ladle Provider) — never from here, never from a component.
 */

export { Avatar, type AvatarProps } from "./Avatar";
export {
  type AnnounceMessage,
  announce,
  clearAnnouncer,
  destroyAnnouncer,
  type Politeness,
} from "./announce";
export { Button, type ButtonProps } from "./Button";
export { type Breakpoint, breakpoints, mq } from "./breakpoints";
export { Callout, type CalloutProps } from "./Callout";
export { CountBadge, type CountBadgeProps } from "./CountBadge";
export { cx } from "./cx";
export {
  type DayDisplayInput,
  type DayDisplayState,
  type DomainDayState,
  dayDisplayState,
  type StatusDisplayState,
} from "./dayDisplayState";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { FAB, type FABProps } from "./FAB";
export { IconButton, type IconButtonProps } from "./IconButton";
export { Legend, type LegendProps } from "./Legend";
export { PersonChip, type PersonChipProps } from "./PersonChip";
export { SectionHeading, type SectionHeadingProps } from "./SectionHeading";
export { Spinner, type SpinnerProps } from "./Spinner";
export { StateDot, type StateDotProps } from "./StateDot";
export { STATUS_LABELS, StatePill, type StatePillProps } from "./StatePill";
export { Surface, type SurfaceProps } from "./Surface";
