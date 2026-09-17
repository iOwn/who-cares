/**
 * The one place a `Notification` becomes an email **and** a web push (SPEC.md:
 * one tier, no informational-only channel). Everything above — the request
 * services, the at-risk backstop, the coalescing queue — produces
 * `Notification`s; this sends them.
 *
 * Framework-free: it takes the `Mailer` / `PushSender` / `MemberRepository`
 * ports, so a test injects fakes and the real wiring lives in `./services.ts`.
 */

import type {
  Mailer,
  MemberRepository,
  Notification,
  PickupRequestRepository,
  PushSender,
} from "@/domain";

export interface DispatchDeps {
  readonly mailer: Mailer;
  readonly pushSender: PushSender;
  readonly members: MemberRepository;
  /** Only the badge count is needed here — see the push branch below (#134). */
  readonly pickupRequests: Pick<PickupRequestRepository, "countOpenForRecipient">;
}

/**
 * Send one notification on both channels. Email is the guaranteed channel
 * (SPEC.md); web push is best-effort on every platform, so a push failure is
 * logged and swallowed rather than allowed to fail the whole dispatch — the
 * recipient still gets the email.
 */
export async function dispatchNotification(
  deps: DispatchDeps,
  notification: Notification,
): Promise<void> {
  const member = await deps.members.findById(notification.recipientId);
  if (!member) {
    console.warn(
      `notification for unknown member ${notification.recipientId} (${notification.event}) dropped`,
    );
    return;
  }

  await deps.mailer.send({
    to: member.email,
    subject: notification.title,
    body: notification.body,
  });

  try {
    // The app-icon badge count (issue #134, ADR-0017) rides along with every
    // push, not just the request events, which is what makes it self-correcting:
    // a withdrawal push carries the lower count that withdrawal produced.
    //
    // Read here, at dispatch time, rather than when the notification was built —
    // a coalesced one may have sat in `pending_notifications` for five minutes
    // (ADR-0012), and the icon should show the count as of the send.
    //
    // Inside this `try` on purpose: a failed count degrades exactly like a
    // failed push — logged and swallowed — and the email still went out above.
    const badge = await deps.pickupRequests.countOpenForRecipient(notification.recipientId);
    await deps.pushSender.send({
      memberId: notification.recipientId,
      title: notification.title,
      body: notification.body,
      badge,
    });
  } catch (error) {
    console.warn(`web push for ${notification.event} failed`, error);
  }
}

/**
 * Send a batch, one after another (sequential — a shared DB connection can't
 * parallelise). One notification failing (a bounced email) must not sink the
 * rest of the batch, so each is guarded — the caller is always post-commit.
 */
export async function dispatchAll(
  deps: DispatchDeps,
  notifications: readonly Notification[],
): Promise<void> {
  for (const notification of notifications) {
    try {
      await dispatchNotification(deps, notification);
    } catch (error) {
      console.warn(`dispatch of ${notification.event} failed`, error);
    }
  }
}
