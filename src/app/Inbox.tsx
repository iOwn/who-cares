"use client";

import { X } from "lucide-react";
import type { Member, PickupRequest } from "@/domain";
import { hasCrossedAtRiskThreshold } from "@/domain";
import { EmptyState, IconButton, RequestCard, RouteHeader } from "@/ui";
import styles from "./Inbox.module.css";

/**
 * The pickup-request inbox (#51) — reached from the header bell. A full-screen
 * list on a narrow container, a right-hand side panel on a wide one: the
 * breakpoint is container-query-driven (`Inbox.module.css` + the
 * `container-type` on the app shell), not viewport-driven, per the ticket.
 *
 * Read-only in v1: Accept / Decline land with the request lifecycle (#52), so
 * `RequestCard` renders here without its action row.
 */

export interface InboxProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  /** Open requests addressed to the current member, soonest childcare day first. */
  readonly requests: readonly PickupRequest[];
  readonly members: readonly Member[];
  /** The current instant, for the timing lines + the 48h threshold check. */
  readonly now: Date;
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function Inbox({ isOpen, onClose, requests, members, now }: InboxProps) {
  if (!isOpen) return null;

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "The other parent";

  return (
    <>
      <button
        type="button"
        className={styles.scrim}
        aria-label="Close requests"
        onClick={onClose}
      />
      <aside className={styles.panel} aria-label="Pickup requests">
        <RouteHeader
          title="Requests"
          onBack={onClose}
          trailing={
            <IconButton variant="ghost" size="sm" aria-label="Close" onPress={onClose}>
              <X size={18} aria-hidden />
            </IconButton>
          }
        />
        <div className={styles.list}>
          {requests.length === 0 ? (
            <EmptyState
              title="You're all caught up"
              description="Pickup requests from the other parent show up here."
            />
          ) : (
            requests.map((request) => (
              <RequestCard
                key={request.id}
                requesterName={nameOf(request.requesterId)}
                dateLabel={formatDay(request.date)}
                raisedAt={request.raisedAt}
                now={now}
                escalating={hasCrossedAtRiskThreshold(request.raisedAt, request.date, now)}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}
