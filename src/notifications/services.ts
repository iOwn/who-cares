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
import {
  type Mailer,
  type Notification,
  type Notifier,
  noopAdapters,
  type PushSender,
} from "@/domain";
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
  const mailer =
    overrides.mailer ??
    createResendMailer(getResendConfig()) ??
    noopAdapters.noopMailer((m, p) => console.info(m, p));
  const pushSender =
    overrides.pushSender ??
    createWebPushSender({
      vapid: getVapidConfig(),
      pushSubscriptions: repos.pushSubscriptions,
    }) ??
    noopAdapters.noopPushSender((m, p) => console.info(m, p));

  const dispatchDeps: DispatchDeps = { mailer, pushSender, members: repos.members };
  const clock = noopAdapters.systemClock;

  const notifier = createNotifier({
    ...dispatchDeps,
    pendingNotifications: repos.pendingNotifications,
    clock,
  });

  // Every caller runs these **after** its transaction commits (SPEC.md: a slow
  // send must not hold a DB transaction open). A send failure must therefore
  // never propagate — the mutation already succeeded, and a thrown error would
  // surface to the user as a failed op they might retry into a double-write.
  // So the whole boundary is log-and-swallow; per-row/per-item guards inside
  // `flush` / `dispatchAll` keep one bad send from stranding a batch.
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
    flush: async () => {
      try {
        return await flushPendingNotifications({
          ...dispatchDeps,
          pendingNotifications: repos.pendingNotifications,
          clock,
        });
      } catch (error) {
        console.error("notifications: flush failed", error);
        return 0;
      }
    },
    dispatchAll: (notifications) =>
      swallow("dispatchAll", () => dispatchAllNotifications(dispatchDeps, notifications)),
  };
}

/** Convenience: build the services straight from a `DbExecutor`. */
export function notificationServicesFor(db: DbExecutor): NotificationServices {
  return createNotificationServices(createRepositories(db));
}
