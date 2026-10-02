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
import { PushNudge } from "./PushNudge";
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
  /**
   * What the installed app's icon shows (issue #174, ADR-0022): open requests
   * plus at-risk days, computed on the server by `needsAttentionCount`. Not the
   * bell's number — the bell stays requests-only.
   */
  readonly iconBadgeCount: number;
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
 * member; the inbox lists those, mounted only while open. That count is
 * not what the installed app's icon shows — that is `iconBadgeCount`, which also
 * counts at-risk days (`useAppBadge`, issues #134, #174).
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
  iconBadgeCount,
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

  // The icon badge (issues #134, #174, ADR-0022): open requests plus at-risk
  // days, not the bell's number. Computed on the server in `page.tsx`, so it is
  // fresh after every `router.refresh()`.
  useAppBadge(iconBadgeCount);

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
        <PushNudge className={styles.installNudge} />
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
