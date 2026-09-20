import { SettingsSkeleton } from "../RouteSkeleton";

/**
 * Loading boundary for `/settings` (issue #144). Its presence is what lets
 * Next prefetch this dynamic route up to the boundary and swap the skeleton
 * in on the gear tap, before the server has run a single query.
 */
export default function Loading() {
  return <SettingsSkeleton />;
}
