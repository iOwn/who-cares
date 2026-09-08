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

export {
  type AnnounceMessage,
  announce,
  clearAnnouncer,
  destroyAnnouncer,
  type Politeness,
} from "./announce";
export { Button, type ButtonProps } from "./Button";
export { type Breakpoint, breakpoints, mq } from "./breakpoints";
export { cx } from "./cx";
export {
  Dialog,
  type DialogHeaderProps,
  type DialogPresentation,
  type DialogProps,
  DialogTrigger,
} from "./Dialog";
export {
  type DayDisplayInput,
  type DayDisplayState,
  type DomainDayState,
  dayDisplayState,
} from "./dayDisplayState";
export { FAB, type FABProps } from "./FAB";
export { IconButton, type IconButtonProps } from "./IconButton";
export {
  SegmentedControl,
  type SegmentedControlItemProps,
  type SegmentedControlProps,
} from "./SegmentedControl";
export { Surface, type SurfaceProps } from "./Surface";
export { ToggleGroup, type ToggleGroupItemProps, type ToggleGroupProps } from "./ToggleGroup";
