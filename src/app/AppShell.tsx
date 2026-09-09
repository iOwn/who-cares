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
import { Calendar } from "./Calendar";
import { Inbox } from "./Inbox";
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
}

/**
 * The authenticated app shell (issues #47–#51): `AppHeader` + the calendar +
 * the pickup-request inbox. A Client Component — `AppHeader`'s handlers are
 * function props, `Calendar` owns paging state, and the bell toggles the inbox.
 *
 * The bell's count is the number of **open** requests addressed to the current
 * member; the inbox lists those, mounted only while open.
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

  return (
    <>
      <AppHeader
        childName={childName}
        requestCount={myOpenRequests.length}
        onOpenRequests={() => setInboxOpen(true)}
        onOpenSettings={() => router.push("/settings")}
      />
      <main aria-label="Calendar">
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
