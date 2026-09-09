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

export { AbsenceImpact, type AbsenceImpactProps, impactLine } from "./AbsenceImpact";
export { ActionBar, type ActionBarProps } from "./ActionBar";
export { AppHeader, type AppHeaderProps } from "./AppHeader";
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
export { CalendarGrid, type CalendarGridProps } from "./CalendarGrid";
export { Callout, type CalloutProps } from "./Callout";
export { CountBadge, type CountBadgeProps } from "./CountBadge";
export {
  type BuildCalendarMonthParams,
  buildCalendarMonth,
  type CalendarDayView,
  type CalendarMonthView,
  monthLabelOf,
  monthOf,
  shiftMonth,
  WEEKDAY_HEADERS,
} from "./calendarMonth";
export { cx } from "./cx";
export { DateField, type DateFieldProps } from "./DateField";
export { DateRangeField, type DateRangeFieldProps } from "./DateRangeField";
export { DayCell, type DayCellProps } from "./DayCell";
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
  isStatusDisplayState,
  STATUS_LABELS,
  type StatusDisplayState,
} from "./dayDisplayState";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { FAB, type FABProps } from "./FAB";
export { IconButton, type IconButtonProps } from "./IconButton";
export { Legend, type LegendProps } from "./Legend";
export { MonthPager, type MonthPagerProps } from "./MonthPager";
export { MonthPicker, type MonthPickerProps } from "./MonthPicker";
export { PersonChip, type PersonChipProps } from "./PersonChip";
export { RequestCard, type RequestCardProps } from "./RequestCard";
export { RouteHeader, type RouteHeaderProps } from "./RouteHeader";
export { requestTimingLine, timeAgo } from "./relativeTime";
export { SectionHeading, type SectionHeadingProps } from "./SectionHeading";
export {
  SegmentedControl,
  type SegmentedControlItemProps,
  type SegmentedControlProps,
} from "./SegmentedControl";
export { Spinner, type SpinnerProps } from "./Spinner";
export { StateDot, type StateDotProps } from "./StateDot";
export { StatePill, type StatePillProps } from "./StatePill";
export { Surface, type SurfaceProps } from "./Surface";
export { TextArea, type TextAreaProps } from "./TextArea";
export { TextField, type TextFieldProps } from "./TextField";
export { ToggleGroup, type ToggleGroupItemProps, type ToggleGroupProps } from "./ToggleGroup";
export { VisuallyHidden, type VisuallyHiddenProps } from "./VisuallyHidden";
export { DEFAULT_WEEKDAYS, WeekdayPicker, type WeekdayPickerProps } from "./WeekdayPicker";
