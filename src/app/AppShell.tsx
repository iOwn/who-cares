"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  Absence,
  Assignment,
  CalendarDate,
  ChildcarePattern,
  Closure,
  Member,
  PickupRequest,
} from "@/domain";
import { AppHeader } from "@/ui";
import styles from "./AppShell.module.css";
import { Calendar } from "./Calendar";
import { Inbox } from "./Inbox";
import { InstallPrompt } from "./InstallPrompt";
import { usePrefetchRoute } from "./prefetchRoute";
import { markSettingsOpenedFromApp, sessionStorageOrNull } from "./settings/backNavigation";
import { useAppBadge } from "./useAppBadge";
import { useWallClock } from "./useWallClock";

export interface AppShellProps {
  readonly childName: string;
  readonly currentMemberId: string;
  readonly pattern: ChildcarePattern | null;
  readonly closures: readonly Closure[];
  readonly members: readonly Member[];
  readonly absences: readonly Absence[];
  readonly assignments: readonly Assignment[];
  readonly pickupRequests: readonly PickupRequest[];
  /** The real current date as the server saw it (`'YYYY-MM-DD'`, UTC). */
  readonly initialToday: CalendarDate;
  /** The real current instant as the server saw it (ISO). */
  readonly initialNow: string;
  /** The viewer’s “hide weekend days” preference (#130), read from their cookie. */
  readonly hideWeekends: boolean;
}

/**
 * The authenticated app shell (issues #47–#51): `AppHeader` + the calendar +
 * the pickup-request inbox. A Client Component — `AppHeader`'s handlers are
 * function props, `Calendar` owns paging state, and the bell toggles the inbox.
 *
 * The bell's count is the number of **open** requests addressed to the current
 * member; the inbox lists those, mounted only while open. That same count is
 * mirrored onto the installed app's icon badge (`useAppBadge`, issue #134).
 */
export function AppShell({
  childName,
  currentMemberId,
  pattern,
  closures,
  members,
  absences,
  assignments,
  pickupRequests,
  initialToday,
  initialNow,
  hideWeekends,
}: AppShellProps) {
  const router = useRouter();
  const [inboxOpen, setInboxOpen] = useState(false);
  const now = useWallClock(initialNow);

  const myOpenRequests = useMemo(
    () =>
      pickupRequests
        .filter((r) => r.state === "Open" && r.recipientId === currentMemberId)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [pickupRequests, currentMemberId],
  );

  // The same number the bell shows, mirrored onto the installed app's icon
  // (issue #134, ADR-0017). Lives here because this is where the count already
  // is, and it re-renders with fresh requests after every `router.refresh()`.
  useAppBadge(myOpenRequests.length);

  // Settings is the only route reachable from here; keep its loading shell
  // warm so the gear responds on the tap, not on the server's first byte
  // (issue #144). The marker lets Settings' back arrow `router.back()` to this
  // cached page instead of re-rendering the calendar.
  usePrefetchRoute("/settings");
  function openSettings() {
    markSettingsOpenedFromApp(sessionStorageOrNull());
    router.push("/settings");
  }

  return (
    <>
      <AppHeader
        childName={childName}
        requestCount={myOpenRequests.length}
        onOpenRequests={() => setInboxOpen(true)}
        onOpenSettings={openSettings}
      />
      <main aria-label="Calendar">
        <InstallPrompt className={styles.installNudge} />
        <Calendar
          currentMemberId={currentMemberId}
          pattern={pattern}
          closures={closures}
          members={members}
          absences={absences}
          assignments={assignments}
          pickupRequests={pickupRequests}
          initialToday={initialToday}
          initialNow={initialNow}
          hideWeekends={hideWeekends}
        />
      </main>
      {inboxOpen ? (
        <Inbox
          onClose={() => setInboxOpen(false)}
          requests={myOpenRequests}
          members={members}
          now={now}
        />
      ) : null}
    </>
  );
}
