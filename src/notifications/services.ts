/**
 * Wire the notification ports to their real adapters (issue #55) — the one
 * place `process.env` meets Resend / `web-push` / the coalescing queue.
 *
 * Every adapter degrades to a no-op when its credentials are absent, so a
 * caller always gets a working `notifier` / `flush` / `dispatchAll` — it just
 * sends nothing in an unconfigured environment (dev, CI, `next build`).
 *
 * Deep-imports `@/db/repositories`, never the `@/db` barrel — see the comment
 * in `src/auth/config.ts` for why the barrel must stay out of the Next graph.
 */

import type { DbExecutor } from "@/db/client";
import { createRepositories, type Repositories } from "@/db/repositories";
import { type Notification, type Notifier, noopAdapters } from "@/domain";
import { type DispatchDeps, dispatchAll as dispatchAllNotifications } from "./dispatch";
import { getResendConfig, getVapidConfig } from "./env";
import { createNotifier, flushPendingNotifications } from "./notifier";
import { createResendMailer } from "./resendMailer";
import { createWebPushSender } from "./webPushSender";

export interface NotificationServices {
  /** The `Notifier` port — coalesces settings events, dispatches the rest. */
  readonly notifier: Notifier;
  /** Send every queued notification whose 5-minute window has elapsed. */
  readonly flush: () => Promise<number>;
  /** Dispatch a batch immediately (used for post-commit notifications). */
  readonly dispatchAll: (notifications: readonly Notification[]) => Promise<void>;
}

type NotificationRepos = Pick<
  Repositories,
  "members" | "pushSubscriptions" | "pendingNotifications"
>;

/**
 * Build the services over a set of repositories (usually `createRepositories(db)`
 * against the base handle — notification work happens *after* the domain
 * transaction commits, not inside it).
 */
export function createNotificationServices(repos: NotificationRepos): NotificationServices {
  const mailer =
    createResendMailer(getResendConfig()) ?? noopAdapters.noopMailer((m, p) => console.info(m, p));
  const pushSender =
    createWebPushSender({
      vapid: getVapidConfig(),
      pushSubscriptions: repos.pushSubscriptions,
    }) ?? noopAdapters.noopPushSender((m, p) => console.info(m, p));

  const dispatchDeps: DispatchDeps = { mailer, pushSender, members: repos.members };
  const clock = noopAdapters.systemClock;

  const notifier = createNotifier({
    ...dispatchDeps,
    pendingNotifications: repos.pendingNotifications,
    clock,
  });

  return {
    notifier,
    flush: () =>
      flushPendingNotifications({
        ...dispatchDeps,
        pendingNotifications: repos.pendingNotifications,
        clock,
      }),
    dispatchAll: (notifications) => dispatchAllNotifications(dispatchDeps, notifications),
  };
}

/** Convenience: build the services straight from a `DbExecutor`. */
export function notificationServicesFor(db: DbExecutor): NotificationServices {
  return createNotificationServices(createRepositories(db));
}
