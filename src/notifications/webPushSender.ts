/**
 * The `web-push`-backed `PushSender` (SPEC.md "Push", ADR-0004).
 *
 * Resolves the recipient member's stored `PushSubscription`s and posts the
 * payload to each. A subscription the push service reports as gone —
 * HTTP `404` or `410` — is dropped from storage (SPEC.md). Any other failure is
 * logged and swallowed: push is best-effort on every platform and email is the
 * guaranteed channel, so one dead endpoint must not sink the rest.
 *
 * `createWebPushSender` returns `null` when the VAPID keys are absent;
 * `./services.ts` falls back to the no-op sender (issue #55).
 */

import webpush from "web-push";
import type { PushSender, PushSubscriptionRepository } from "@/domain";

export interface VapidConfig {
  readonly publicKey: string;
  readonly privateKey: string;
  /** `mailto:` or `https:` contact URI the push services require. */
  readonly subject: string;
}

export interface WebPushDeps {
  readonly vapid: VapidConfig | null;
  readonly pushSubscriptions: PushSubscriptionRepository;
}

export function createWebPushSender(deps: WebPushDeps): PushSender | null {
  if (!deps.vapid) return null;
  webpush.setVapidDetails(deps.vapid.subject, deps.vapid.publicKey, deps.vapid.privateKey);

  return {
    async send(message): Promise<void> {
      const subscriptions = await deps.pushSubscriptions.listByMember(message.memberId);
      const payload = JSON.stringify({ title: message.title, body: message.body });

      for (const subscription of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await deps.pushSubscriptions.deleteByEndpoint(subscription.endpoint);
          } else {
            console.warn(`web push to ${subscription.endpoint} failed`, error);
          }
        }
      }
    },
  };
}
