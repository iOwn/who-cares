"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Member, PickupRequest } from "@/domain";
import { hasCrossedAtRiskThreshold } from "@/domain";
import { Button, Callout, EmptyState, IconButton, RequestCard, RouteHeader } from "@/ui";
import { shortDate } from "./formatCalendarDate";
import styles from "./Inbox.module.css";
import {
  acceptRequestAction,
  declineRequestAction,
  type RequestActionResult,
} from "./requestActions";

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
 * Accept / Decline (#52) are wired here as the `RequestCard` `actions` slot.
 * Each day is answered individually — there is no batch action even when
 * several requests arrived from one absence (SPEC.md "Pickup requests"). A
 * successful answer revalidates `/`, so the answered request drops out of the
 * list on the next render.
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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

  const answer = (requestId: string, action: (id: string) => Promise<RequestActionResult>) => {
    setError(null);
    setNote(null);
    setPendingId(requestId);
    startTransition(async () => {
      const result = await action(requestId);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.note) setNote(result.note);
      router.refresh();
    });
  };

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
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
        {note ? (
          <Callout tone="info" dot>
            {note}
          </Callout>
        ) : null}
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
              actions={
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    isDisabled={pending}
                    onPress={() => answer(request.id, acceptRequestAction)}
                  >
                    {pending && pendingId === request.id ? "Saving…" : "Accept"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={pending}
                    onPress={() => answer(request.id, declineRequestAction)}
                  >
                    Decline
                  </Button>
                </>
              }
            />
          ))
        )}
      </div>
    </aside>
  );
}
