import { CalendarSkeleton } from "./RouteSkeleton";

/**
 * Loading boundary for `/` (issue #144). Its presence is what lets Next
 * prefetch this dynamic route up to the boundary and swap the skeleton in on
 * navigation; it also streams ahead of the page on a hard load.
 */
export default function Loading() {
  return <CalendarSkeleton />;
}
