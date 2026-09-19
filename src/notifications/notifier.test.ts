/**
 * The real `Notifier` and the dispatch boundary (issue #55, issue #131;
 * `docs/testing.md` §4).
 *
 * Two contracts live here:
 *   - `createNotifier().notify()` sends one notification on both channels,
 *     immediately — there is no queue and no window any more (ADR-0018
 *     supersedes ADR-0012).
 *   - `dispatchAll()` is where **per-action bundling** happens: one action's
 *     notifications collapse to at most one per `(recipient, event)`. The pure
 *     grouping and copy rules are pinned in
 *     `src/domain/services/notificationBundling.test.ts`; this file pins that
 *     `dispatchAll` actually applies them, and that a failing send still can't
 *     strand the rest of the batch.
 *
 * Pure ports in, fakes injected — no database, no Gmail SMTP, no `web-push`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSIGNMENT_STANDS_EVENT,
  CHILDCARE_PATTERN_CHANGED_EVENT,
  type EmailMessage,
  type Mailer,
  type MemberRepository,
  type Notification,
  PICKUP_REQUEST_ACCEPTED_EVENT,
  PICKUP_REQUEST_WITHDRAWN_EVENT,
  type PushMessage,
  type PushSender,
} from "@/domain";
import { MEMBER_1_ID, MEMBER_2_ID, makeMember } from "@/testing";
import { dispatchAll } from "./dispatch";
import { createNotifier } from "./notifier";

function createFakes() {
  const emails: EmailMessage[] = [];
  const pushes: PushMessage[] = [];

  const mailer: Mailer = {
    async send(m) {
      emails.push(m);
    },
  };
  const pushSender: PushSender = {
    async send(m) {
      pushes.push(m);
    },
  };
  const members: MemberRepository = {
    async findById(id) {
      if (id === MEMBER_1_ID) return makeMember({ id: MEMBER_1_ID, email: "alex@example.com" });
      if (id === MEMBER_2_ID) return makeMember({ id: MEMBER_2_ID, email: "bailey@example.com" });
      return null;
    },
    async findByEmail() {
      return null;
    },
    async listByHousehold() {
      return [];
    },
    async save() {},
  };

  // The unresolved count each push carries as its app-icon badge (issue #134).
  const openRequests = { count: 0 };
  const pickupRequests = {
    async countOpenForRecipient() {
      return openRequests.count;
    },
  };

  return { emails, pushes, mailer, pushSender, members, pickupRequests, openRequests };
}

const notification = (over: Partial<Notification> = {}): Notification => ({
  recipientId: MEMBER_1_ID,
  event: PICKUP_REQUEST_ACCEPTED_EVENT,
  title: "Bailey is covering pickup",
  body: "Bailey accepted your pickup request for 2025-01-08.",
  ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("createNotifier", () => {
  it("dispatches to both channels right away", async () => {
    const f = createFakes();
    await createNotifier(f).notify(notification());

    expect(f.emails).toEqual([
      {
        to: "alex@example.com",
        subject: "Bailey is covering pickup",
        body: "Bailey accepted your pickup request for 2025-01-08.",
      },
    ]);
    expect(f.pushes).toHaveLength(1);
  });

  it("sends a settings event immediately too — nothing waits on a window", async () => {
    // The two settings events used to sit in `pending_notifications` for five
    // minutes (ADR-0012). ADR-0018 dropped that: an action's notification goes
    // out with the action.
    const f = createFakes();
    await createNotifier(f).notify(
      notification({
        event: CHILDCARE_PATTERN_CHANGED_EVENT,
        title: "The childcare pattern changed",
        body: "Alex updated which weekdays are childcare days.",
      }),
    );

    expect(f.emails).toHaveLength(1);
    expect(f.pushes).toHaveLength(1);
  });

  it("drops a notification for an unknown member rather than throwing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = createFakes();

    await expect(
      createNotifier(f).notify(notification({ recipientId: "nobody" })),
    ).resolves.toBeUndefined();
    expect(f.emails).toEqual([]);
  });
});

describe("dispatchAll — per-action bundling (issue #131)", () => {
  /** What cancelling a three-day absence produces: one withdrawal per day. */
  const withdrawals = (dates: readonly string[]): Notification[] =>
    dates.map((date) => ({
      recipientId: MEMBER_1_ID,
      event: PICKUP_REQUEST_WITHDRAWN_EVENT,
      title: "Alex's absence changed",
      body: `Alex's absence changed, so their pickup request for ${date} was withdrawn.`,
      subjectLabel: date,
    }));

  it("collapses one action's same-event notifications into a single mail + push", async () => {
    const f = createFakes();

    await dispatchAll(f, withdrawals(["2025-01-08", "2025-01-09", "2025-01-10"]));

    expect(f.emails).toHaveLength(1);
    expect(f.pushes).toHaveLength(1);
    expect(f.emails[0].subject).toBe("3 pickup requests were withdrawn");
    expect(f.emails[0].body).toContain("2025-01-08, 2025-01-09 and 2025-01-10");
  });

  it("leaves a lone notification exactly as the domain service wrote it", async () => {
    const f = createFakes();

    await dispatchAll(f, withdrawals(["2025-01-08"]));

    expect(f.emails).toEqual([
      {
        to: "alex@example.com",
        subject: "Alex's absence changed",
        body: "Alex's absence changed, so their pickup request for 2025-01-08 was withdrawn.",
      },
    ]);
  });

  it("bundles per recipient and per event, not across them", async () => {
    const f = createFakes();

    await dispatchAll(f, [
      ...withdrawals(["2025-01-08", "2025-01-09"]),
      {
        recipientId: MEMBER_2_ID,
        event: ASSIGNMENT_STANDS_EVENT,
        title: "You're still on pickup for 2025-01-08",
        body: "…",
        subjectLabel: "2025-01-08",
      },
    ]);

    // One bundled withdrawal mail to member 1, one untouched mail to member 2.
    expect(f.emails.map((e) => e.to)).toEqual(["alex@example.com", "bailey@example.com"]);
    expect(f.emails[1].subject).toBe("You're still on pickup for 2025-01-08");
  });

  it("two separate actions are two mails — bundling is per call, not per window", async () => {
    const f = createFakes();

    await dispatchAll(f, withdrawals(["2025-01-08"]));
    await dispatchAll(f, withdrawals(["2025-01-09"]));

    expect(f.emails).toHaveLength(2);
  });

  it("one un-sendable notification does not strand the rest of the batch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = createFakes();
    f.mailer.send = async (m) => {
      if (m.to === "alex@example.com") throw new Error("Gmail SMTP 422");
      f.emails.push(m);
    };

    await expect(
      dispatchAll(f, [
        notification({ recipientId: MEMBER_1_ID }),
        notification({ recipientId: MEMBER_2_ID }),
      ]),
    ).resolves.toBeUndefined();

    expect(f.emails.map((e) => e.to)).toEqual(["bailey@example.com"]);
  });
});

describe("dispatch — the app-icon badge count (issue #134)", () => {
  it("carries the recipient's unresolved count on the push", async () => {
    const f = createFakes();
    f.openRequests.count = 3;

    await createNotifier(f).notify(notification());

    expect(f.pushes).toHaveLength(1);
    expect(f.pushes[0].badge).toBe(3);
  });

  it("sends a zero count so a resolved last request takes the badge off", async () => {
    // The badge rides on *every* push, not just the request events — that is
    // what makes it self-correcting: the withdrawal notification itself is what
    // clears the icon the withdrawn request had lit up.
    const f = createFakes();
    f.openRequests.count = 0;

    await createNotifier(f).notify(notification());

    expect(f.pushes[0].badge).toBe(0);
  });

  it("reads the count at send time, so a bundle ships the post-action number", async () => {
    const f = createFakes();
    f.openRequests.count = 1;

    // The count moves between building the notifications and dispatching them,
    // exactly as a post-commit dispatch sees it.
    f.openRequests.count = 0;
    await dispatchAll(f, [notification()]);

    expect(f.pushes[0].badge).toBe(0);
  });

  it("still sends both channels when the count can't be read, minus the badge", async () => {
    // The badge is a nicety; the notification is the point. A failed count costs
    // the icon its number, never the parent their notification — and the absent
    // `badge` makes `sw.js` leave whatever is on the icon alone.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = createFakes();
    f.pickupRequests.countOpenForRecipient = async () => {
      throw new Error("db down");
    };

    await expect(createNotifier(f).notify(notification())).resolves.toBeUndefined();

    expect(f.emails).toHaveLength(1);
    expect(f.pushes).toHaveLength(1);
    expect(f.pushes[0].badge).toBeUndefined();
  });
});
