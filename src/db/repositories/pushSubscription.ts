import { eq } from "drizzle-orm";
import type { PushSubscriptionRepository, StoredPushSubscription } from "@/domain";
import type { DbExecutor } from "../client";
import { pushSubscriptions } from "../schema";

/**
 * The PGlite/Drizzle-backed `PushSubscriptionRepository` (ADR-0005 port, issues
 * #55, #90). `endpoint` is unique — `save` upserts on it so a browser
 * re-subscribing (a rotated endpoint aside) refreshes its keys and `user_agent`
 * rather than duplicating. A push that returns `404`/`410` calls
 * `deleteByEndpoint` to drop the dead row; the `/settings` push card calls it
 * for a deliberate opt-out.
 */
function toStored(row: {
  id: string;
  memberId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
}): StoredPushSubscription {
  return {
    id: row.id,
    memberId: row.memberId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}

export function createPushSubscriptionRepository(db: DbExecutor): PushSubscriptionRepository {
  const columns = {
    id: pushSubscriptions.id,
    memberId: pushSubscriptions.memberId,
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
    userAgent: pushSubscriptions.userAgent,
    createdAt: pushSubscriptions.createdAt,
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
        .values({
          id: subscription.id,
          memberId: subscription.memberId,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          userAgent: subscription.userAgent ?? null,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            memberId: subscription.memberId,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            userAgent: subscription.userAgent ?? null,
          },
        });
    },

    async deleteByEndpoint(endpoint: string): Promise<void> {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    },
  };
}
