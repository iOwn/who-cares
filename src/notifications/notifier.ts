/**
 * The real `Notifier` (issue #55) — the port every functional slice already
 * calls. It does the one thing the callers deliberately don't: **fan-out** —
 * turn a `Notification` into an email + a web push (`./dispatch.ts`).
 *
 * That is now all it does. It used to also hold a 5-minute coalescing queue for
 * the two settings events; issue #131 replaced time-windowed coalescing with
 * per-action bundling at `dispatchAll` (ADR-0018 supersedes ADR-0012), so there
 * is no queue, no `send_after`, and no flush — a notification raised by an
 * action goes out with that action.
 *
 * A caller with several notifications from one action uses `dispatchAll`, which
 * bundles them; `notify` is for the single-notification case.
 *
 * Framework-free — ports in, ports out; the real adapters are wired in
 * `./services.ts`.
 */

import type { Notification, Notifier } from "@/domain";
import { type DispatchDeps, dispatchNotification } from "./dispatch";

/** Everything `dispatchNotification` needs — nothing more. */
export type NotifierDeps = DispatchDeps;

export function createNotifier(deps: NotifierDeps): Notifier {
  return {
    async notify(notification: Notification): Promise<void> {
      await dispatchNotification(deps, notification);
    },
  };
}
