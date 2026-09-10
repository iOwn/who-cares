import { lte } from "drizzle-orm";
import type { PendingNotification, PendingNotificationRepository } from "@/domain";
import type { DbExecutor } from "../client";
import { pendingNotifications } from "../schema";

/**
 * The PGlite/Drizzle-backed `PendingNotificationRepository` (ADR-0005 port,
 * issue #55) — the 5-minute coalescing queue.
 *
 * `upsert` targets `coalesce_key`: a second edit to the same record replaces the
 * payload and pushes `send_after` forward, so the window is genuinely rolling
 * and only the final state is ever sent. `claimDue` is a single
 * `DELETE … RETURNING` so concurrent flushes can't double-send.
 */
function toPending(row: {
  id: string;
  coalesceKey: string;
  recipientId: string;
  event: string;
  title: string;
  body: string;
  sendAfter: Date;
}): PendingNotification {
  return row;
}

export function createPendingNotificationRepository(db: DbExecutor): PendingNotificationRepository {
  const columns = {
    id: pendingNotifications.id,
    coalesceKey: pendingNotifications.coalesceKey,
    recipientId: pendingNotifications.recipientId,
    event: pendingNotifications.event,
    title: pendingNotifications.title,
    body: pendingNotifications.body,
    sendAfter: pendingNotifications.sendAfter,
  };

  return {
    async upsert(pending: PendingNotification): Promise<void> {
      await db
        .insert(pendingNotifications)
        .values(pending)
        .onConflictDoUpdate({
          target: pendingNotifications.coalesceKey,
          set: {
            recipientId: pending.recipientId,
            event: pending.event,
            title: pending.title,
            body: pending.body,
            sendAfter: pending.sendAfter,
          },
        });
    },

    async claimDue(now: Date): Promise<PendingNotification[]> {
      const rows = await db
        .delete(pendingNotifications)
        .where(lte(pendingNotifications.sendAfter, now))
        .returning(columns);
      // `RETURNING` has no `ORDER BY`; sort oldest-first in memory.
      return rows.map(toPending).sort((a, b) => a.sendAfter.getTime() - b.sendAfter.getTime());
    },
  };
}
