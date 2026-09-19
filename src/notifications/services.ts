/**
 * Wire the notification ports to their real adapters (issue #55) — the one
 * place `process.env` meets Gmail SMTP / `web-push`.
 *
 * Every adapter degrades to a no-op when its credentials are absent, so a
 * caller always gets a working `notifier` / `dispatchAll` — it just
 * sends nothing in an unconfigured environment (dev, CI, `next build`). A
 * deployment with the E2E test seam armed degrades the same way even when the
 * credentials *are* present (issue #139) — see the gate in the factory below.
 *
 * Deep-imports `@/db/repositories`, never the `@/db` barrel — see the comment
 * in `src/auth/config.ts` for why the barrel must stay out of the Next graph.
 */

import type { DbExecutor } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import {
  type Mailer,
  type Notification,
  type Notifier,
  noopAdapters,
  type PushSender,
} from "@/domain";
import { isTestModeEnabled } from "@/testing/testMode";
import { type DispatchDeps, dispatchAll as dispatchAllNotifications } from "./dispatch";
import { getGmailConfig, getVapidConfig } from "./env";
import { createGmailMailer } from "./gmailMailer";
import { createNotifier } from "./notifier";
import { createWebPushSender } from "./webPushSender";

export interface NotificationServices {
  /** The `Notifier` port — dispatches one notification, email + web push. */
  readonly notifier: Notifier;
  /**
   * Dispatch **one action's** notifications, bundled per `(recipient, event)`
   * (ADR-0018). The normal path for post-commit notifications; a caller holding
   * more than one always uses this rather than `notifier.notify` in a loop.
   */
  readonly dispatchAll: (notifications: readonly Notification[]) => Promise<void>;
}

type NotificationRepos = Pick<Repositories, "members" | "pushSubscriptions" | "pickupRequests">;

/** Adapter overrides — only tests pass these; production reads them from env. */
export interface NotificationServiceOverrides {
  readonly mailer?: Mailer;
  readonly pushSender?: PushSender;
}

/**
 * Build the services over a set of repositories (usually `createRepositories(db)`
 * against the base handle — notification work happens *after* the domain
 * transaction commits, not inside it).
 */
export function createNotificationServices(
  repos: NotificationRepos,
  overrides: NotificationServiceOverrides = {},
): NotificationServices {
  // A deployment with the E2E test seam armed is a test rig: `/api/test/seed`
  // truncates the database and re-inserts the fixed smoke household, and the
  // Playwright run then drives real absences and claims through it. Its
  // members carry the two allowlisted addresses, so with credentials present
  // every one of those steps would post a real "Bailey will cover the pickup"
  // mail into a real inbox (issue #139). Fall back to the no-op adapters
  // before the env ones so nothing leaves the deployment at all — redirecting
  // the mail elsewhere would still relay it and bounce.
  //
  // Magic-link auth mail is deliberately NOT gated here: it goes out through
  // `src/auth/config.ts`, only ever in response to a human typing their own
  // address, so a preview deploy stays signable-in by hand.
  const suppressDelivery = isTestModeEnabled();
  const noopMailer = () => noopAdapters.noopMailer((m, p) => console.info(m, p));
  const noopPushSender = () => noopAdapters.noopPushSender((m, p) => console.info(m, p));

  const mailer =
    overrides.mailer ??
    (suppressDelivery ? noopMailer() : (createGmailMailer(getGmailConfig()) ?? noopMailer()));
  const pushSender =
    overrides.pushSender ??
    (suppressDelivery
      ? noopPushSender()
      : (createWebPushSender({
          vapid: getVapidConfig(),
          pushSubscriptions: repos.pushSubscriptions,
        }) ?? noopPushSender()));

  const dispatchDeps: DispatchDeps = {
    mailer,
    pushSender,
    members: repos.members,
    pickupRequests: repos.pickupRequests,
  };
  const notifier = createNotifier(dispatchDeps);

  // Every caller runs these **after** its transaction commits (SPEC.md: a slow
  // send must not hold a DB transaction open). A send failure must therefore
  // never propagate — the mutation already succeeded, and a thrown error would
  // surface to the user as a failed op they might retry into a double-write.
  // So the whole boundary is log-and-swallow; the per-item guard inside
  // `dispatchAll` keeps one bad send from stranding a batch.
  const swallow = async (label: string, run: () => Promise<unknown>): Promise<void> => {
    try {
      await run();
    } catch (error) {
      console.error(`notifications: ${label} failed (mutation already committed)`, error);
    }
  };

  return {
    notifier: {
      notify: (notification) => swallow("notify", () => notifier.notify(notification)),
    },
    dispatchAll: (notifications) =>
      swallow("dispatchAll", () => dispatchAllNotifications(dispatchDeps, notifications)),
  };
}

/** Convenience: build the services straight from a `DbExecutor`. */
export function notificationServicesFor(db: DbExecutor): NotificationServices {
  return createNotificationServices(createRepositories(db));
}
