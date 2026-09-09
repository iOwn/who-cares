"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Member, PickupRequest } from "@/domain";
import { hasCrossedAtRiskThreshold } from "@/domain";
import { EmptyState, IconButton, RequestCard, RouteHeader } from "@/ui";
import { shortDate } from "./formatCalendarDate";
import styles from "./Inbox.module.css";

/**
 * The pickup-request inbox (#51) — reached from the header bell. A full-screen
 * list on phones, a right-hand side-panel *region* from `--bp-md` up
 * (`Inbox.module.css`). #51 asked for this to be container-query-driven, but
 * `docs/design-system.md` §10 (and `breakpoints.ts` / `tokens.css`, which
 * earmark `--bp-md` for exactly this switch) settle it as a viewport `@media`:
 * the app shell is always full viewport width, so there is no container to
 * query — see the PR discussion.
 *
 * Deliberately **not a `Dialog`** (docs/design-system-inventory.md §9): on
 * desktop it is a non-modal region — no scrim, the calendar stays live. It
 * still moves focus into itself on open, restores it on close, and closes on
 * `Escape`, so keyboard users aren't stranded.
 *
 * Read-only in v1: Accept / Decline land with the request lifecycle (#52), so
 * `RequestCard` renders here without its action row. `Calendar`/`AppShell`
 * mount this only while open.
 */

export interface InboxProps {
  readonly onClose: () => void;
  /** Open requests addressed to the current member, soonest childcare day first. */
  readonly requests: readonly PickupRequest[];
  readonly members: readonly Member[];
  /** The current instant, for the timing lines + the 48h threshold check. */
  readonly now: Date;
}

export function Inbox({ onClose, requests, members, now }: InboxProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "The other parent";

  return (
    <aside ref={panelRef} className={styles.panel} aria-label="Pickup requests">
      <RouteHeader
        title="Requests"
        onBack={onClose}
        trailing={
          <IconButton ref={closeRef} variant="ghost" size="sm" aria-label="Close" onPress={onClose}>
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
              dateLabel={shortDate(request.date)}
              raisedAt={request.raisedAt}
              now={now}
              escalating={hasCrossedAtRiskThreshold(request.raisedAt, request.date, now)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
