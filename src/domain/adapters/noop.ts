/**
 * No-op / logging implementations of the service ports.
 *
 * These stand in wherever a real side effect is neither wanted nor available:
 * `next build`, local dev without Resend / VAPID keys, and any test that
 * doesn't assert on dispatch. Tests that *do* assert on dispatch inject their
 * own spies instead.
 */

import type {
  Clock,
  EmailMessage,
  Mailer,
  Notification,
  Notifier,
  PushMessage,
  PushSender,
} from '../ports';

/** The real wall clock. Not a fake — the honest default `Clock`. */
export const systemClock: Clock = {
  now: () => new Date(),
};

/** A `Clock` frozen at a fixed instant. Handy for wiring and demos. */
export function fixedClock(instant: Date): Clock {
  return { now: () => new Date(instant.getTime()) };
}

type Logger = (message: string, payload: unknown) => void;

const silent: Logger = () => {};

/** A `Mailer` that discards every message (optionally logging it). */
export function noopMailer(log: Logger = silent): Mailer {
  return {
    async send(message: EmailMessage): Promise<void> {
      log('noopMailer.send', message);
    },
  };
}

/** A `PushSender` that discards every message (optionally logging it). */
export function noopPushSender(log: Logger = silent): PushSender {
  return {
    async send(message: PushMessage): Promise<void> {
      log('noopPushSender.send', message);
    },
  };
}

/** A `Notifier` that discards every notification (optionally logging it). */
export function noopNotifier(log: Logger = silent): Notifier {
  return {
    async notify(notification: Notification): Promise<void> {
      log('noopNotifier.notify', notification);
    },
  };
}
