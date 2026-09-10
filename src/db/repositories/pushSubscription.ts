import { eq } from "drizzle-orm";
import type { PushSubscriptionRepository, StoredPushSubscription } from "@/domain";
import type { DbExecutor } from "../client";
import { pushSubscriptions } from "../schema";

/**
 * The PGlite/Drizzle-backed `PushSubscriptionRepository` (ADR-0005 port, issue
 * #55). `endpoint` is unique — `save` upserts on it so a browser re-subscribing
 * (a rotated endpoint aside) refreshes its keys rather than duplicating. A push
 * that returns `404`/`410` calls `deleteByEndpoint` to drop the dead row.
 */
function toStored(row: {
  id: string;
  memberId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): StoredPushSubscription {
  return {
    id: row.id,
    memberId: row.memberId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
  };
}

export function createPushSubscriptionRepository(db: DbExecutor): PushSubscriptionRepository {
  const columns = {
    id: pushSubscriptions.id,
    memberId: pushSubscriptions.memberId,
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
  };

  return {
    async listByMember(memberId: string): Promise<StoredPushSubscription[]> {
      const rows = await db
        .select(columns)
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.memberId, memberId));
      return rows.map(toStored);
    },

    async save(subscription: StoredPushSubscription): Promise<void> {
      await db
        .insert(pushSubscriptions)
        .values(subscription)
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            memberId: subscription.memberId,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        });
    },

    async deleteByEndpoint(endpoint: string): Promise<void> {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    },
  };
}
