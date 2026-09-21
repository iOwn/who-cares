import { SettingsSkeleton } from "../RouteSkeleton";

/**
 * Loading boundary for both Settings tabs (issues #144, #143). Its presence
 * is what lets Next prefetch this dynamic route up to the boundary and swap
 * the skeleton in on the gear tap — before the server has run a single
 * query. It sits at the `settings` segment, above `household/`, on purpose:
 * a prefetch only carries the tree down to the *first* loading boundary, so
 * a second one in `household/` would show this fallback, then its own, then
 * the page. One boundary means one swap.
 */
export default function Loading() {
  return <SettingsSkeleton />;
}
