import { cookies } from "next/headers";
import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import {
  buildDayStateFacts,
  DEFAULT_ESCALATION_HORIZON_DAYS,
  mergeClosures,
  needsAttentionCount,
  publicHolidayClosures,
  publicHolidayWindow,
} from "@/domain";
import { AppShell } from "./AppShell";
import { HIDE_WEEKENDS_COOKIE, parseHideWeekends } from "./calendarPreferences";
import { SignInScreen } from "./SignInScreen";

export default async function Home() {
  const current = await getCurrentSession();
  if (!current) {
    return <SignInScreen />;
  }

  // Read on the server so the grid's column count is right in the very first
  // HTML — the whole reason the preference is a cookie (#130).
  const cookieStore = await cookies();
  const hideWeekends = parseHideWeekends(cookieStore.get(HIDE_WEEKENDS_COOKIE)?.value);

  const repos = createRepositories(db);
  const [pattern, storedClosures, members, absences, assignments, pickupRequests] =
    await Promise.all([
      repos.childcarePattern.findByHousehold(current.household.id),
      repos.closures.listByHousehold(current.household.id),
      repos.members.listByHousehold(current.household.id),
      repos.absences.listByHousehold(current.household.id),
      repos.assignments.listByHousehold(current.household.id),
      repos.pickupRequests.listByHousehold(current.household.id),
    ]);

  // One server instant, formatted two ways — the calendar corrects both to the
  // viewer's clock after mount.
  const serverNow = new Date();
  const today = serverNow.toISOString().slice(0, 10);

  // Public holidays (issue #167, ADR-0020) are derived, never stored, and
  // merged in here — the one place the whole client calendar (Grid, List,
  // DayDetail, the "+ I'm out" impact preview) loads its closures from.
  const closures = current.household.bundesland
    ? mergeClosures(
        storedClosures,
        publicHolidayClosures({
          householdId: current.household.id,
          state: current.household.bundesland,
          pattern,
          ...publicHolidayWindow(today),
        }),
      )
    : storedClosures;

  // The icon badge (issue #174, ADR-0022): open requests + at-risk days, the same
  // function `dispatch` uses for the push payload, over the data loaded above.
  const iconBadgeCount = needsAttentionCount({
    memberId: current.member.id,
    requests: pickupRequests,
    days: buildDayStateFacts({
      pattern,
      closures,
      absences,
      assignments,
      requests: pickupRequests,
      today,
      horizonDays: DEFAULT_ESCALATION_HORIZON_DAYS,
    }),
    now: serverNow,
  });

  return (
    <AppShell
      childName={current.child?.name ?? ""}
      currentMemberId={current.member.id}
      pattern={pattern}
      closures={closures}
      members={members}
      absences={absences}
      assignments={assignments}
      pickupRequests={pickupRequests}
      iconBadgeCount={iconBadgeCount}
      initialToday={today}
      initialNow={serverNow.toISOString()}
      hideWeekends={hideWeekends}
    />
  );
}
