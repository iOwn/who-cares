/**
 * The real `Notifier` (issue #55) — the port every functional slice already
 * calls. It does two things the callers deliberately don't:
 *
 *   1. **Fan-out** — turns a `Notification` into an email + a web push
 *      (`./dispatch.ts`).
 *   2. **Coalescing** — the two settings events (pattern-changed, closure-added)
 *      don't dispatch straight away; they go into the `pending_notifications`
 *      queue keyed by the record's `coalesceKey`, with `sendAfter = now + 5min`.
 *      A second edit to the same record upserts the row (new payload, window
 *      pushed forward), so repeated edits collapse into one notification of the
 *      final state. `flushPendingNotifications` drains due rows — it runs at the
 *      top of every server action and on the daily cron (ADR-0004: no second
 *      scheduler, so a lone edit's notification can lag until the next app
 *      activity or the cron tick).
 *
 * Framework-free — ports in, ports out; the real adapters are wired in
 * `./services.ts`.
 */

import {
  COALESCE_WINDOW_MS,
  isCoalescableEvent,
  type Mailer,
  type MemberRepository,
  type Notification,
  type Notifier,
  type PendingNotificationRepository,
  type PushSender,
} from "@/domain";
import { dispatchNotification } from "./dispatch";

export interface NotifierDeps {
  readonly mailer: Mailer;
  readonly pushSender: PushSender;
  readonly members: MemberRepository;
  readonly pendingNotifications: PendingNotificationRepository;
  readonly clock: { now(): Date };
  /** New ids for queue rows. Defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
}

export function createNotifier(deps: NotifierDeps): Notifier {
  const newId = deps.newId ?? (() => crypto.randomUUID());

  return {
    async notify(notification: Notification): Promise<void> {
      if (!isCoalescableEvent(notification.event)) {
        await dispatchNotification(deps, notification);
        return;
      }

      if (!notification.coalesceKey) {
        throw new Error(
          `coalescable event "${notification.event}" was raised without a coalesceKey`,
        );
      }

      await deps.pendingNotifications.upsert({
        id: newId(),
        coalesceKey: notification.coalesceKey,
        recipientId: notification.recipientId,
        event: notification.event,
        title: notification.title,
        body: notification.body,
        sendAfter: new Date(deps.clock.now().getTime() + COALESCE_WINDOW_MS),
      });
    },
  };
}

export interface FlushDeps {
  readonly mailer: Mailer;
  readonly pushSender: PushSender;
  readonly members: MemberRepository;
  readonly pendingNotifications: PendingNotificationRepository;
  readonly clock: { now(): Date };
}

/**
 * Dispatch every queued notification whose 5-minute window has elapsed, then
 * drop its row. Returns how many were sent. Safe to call often and from
 * anywhere — the `sendAfter <= now` filter is the whole gate.
 */
export async function flushPendingNotifications(deps: FlushDeps): Promise<number> {
  const due = await deps.pendingNotifications.listDue(deps.clock.now());
  for (const row of due) {
    await dispatchNotification(deps, {
      recipientId: row.recipientId,
      event: row.event,
      title: row.title,
      body: row.body,
    });
    await deps.pendingNotifications.delete(row.id);
  }
  return due.length;
}
