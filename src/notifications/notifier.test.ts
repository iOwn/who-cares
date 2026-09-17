/**
 * The real `Notifier` and its 5-minute coalescing window (issue #55,
 * `docs/testing.md` §4 point 2 — the coalescing-window cases).
 *
 * Pure ports in, fakes injected — no database, no Gmail SMTP, no `web-push`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHILDCARE_PATTERN_CHANGED_EVENT,
  CLOSURE_ADDED_EVENT,
  COALESCE_WINDOW_MS,
  type EmailMessage,
  type Mailer,
  type MemberRepository,
  type Notification,
  type PendingNotification,
  type PendingNotificationRepository,
  PICKUP_REQUEST_ACCEPTED_EVENT,
  type PushMessage,
  type PushSender,
} from "@/domain";
import { MEMBER_1_ID, makeMember } from "@/testing";
import { createNotifier, flushPendingNotifications } from "./notifier";

function createFakes(now: Date) {
  const emails: EmailMessage[] = [];
  const pushes: PushMessage[] = [];
  const queue = new Map<string, PendingNotification>();
  let seq = 0;

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
      return id === MEMBER_1_ID ? makeMember({ id: MEMBER_1_ID, email: "alex@example.com" }) : null;
    },
    async findByEmail() {
      return null;
    },
    async listByHousehold() {
      return [];
    },
    async save() {},
  };
  const pendingNotifications: PendingNotificationRepository = {
    async upsert(pending) {
      queue.set(pending.coalesceKey, pending);
    },
    async claimDue(at) {
      const due = [...queue.entries()].filter(([, row]) => row.sendAfter <= at);
      for (const [key] of due) queue.delete(key);
      return due
        .map(([, row]) => row)
        .sort((a, b) => a.sendAfter.getTime() - b.sendAfter.getTime());
    },
  };

  // The unresolved count each push carries as its app-icon badge (issue #134).
  // Mutable on purpose: a test moves it between `notify()` and `flush()` to pin
  // that the count is read when the notification is *sent*, not when queued.
  const openRequests = { count: 0 };
  const pickupRequests = {
    async countOpenForRecipient() {
      return openRequests.count;
    },
  };

  const clock = { now: () => new Date(now.getTime()) };
  const newId = () => {
    seq += 1;
    return `pending-${seq}`;
  };

  return {
    emails,
    pushes,
    queue,
    mailer,
    pushSender,
    members,
    pendingNotifications,
    pickupRequests,
    openRequests,
    clock,
    newId,
  };
}

const NOW = new Date("2025-01-06T09:00:00.000Z");

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

describe("createNotifier — immediate events", () => {
  it("dispatches a non-coalescable event to both channels right away", async () => {
    const f = createFakes(NOW);
    await createNotifier(f).notify(notification());

    expect(f.emails).toEqual([
      {
        to: "alex@example.com",
        subject: "Bailey is covering pickup",
        body: "Bailey accepted your pickup request for 2025-01-08.",
      },
    ]);
    expect(f.pushes).toHaveLength(1);
    expect(f.queue.size).toBe(0);
  });
});

describe("createNotifier — coalescing", () => {
  const patternEdit = (over: Partial<Notification> = {}) =>
    notification({
      event: CHILDCARE_PATTERN_CHANGED_EVENT,
      coalesceKey: `${CHILDCARE_PATTERN_CHANGED_EVENT}:household-1`,
      title: "The childcare pattern changed",
      body: "v1",
      ...over,
    });

  it("queues a coalescable event instead of sending it, with a 5-minute window", async () => {
    const f = createFakes(NOW);
    await createNotifier(f).notify(patternEdit());

    expect(f.emails).toEqual([]);
    expect(f.pushes).toEqual([]);
    expect(f.queue.size).toBe(1);
    const [row] = [...f.queue.values()];
    expect(row.sendAfter.getTime()).toBe(NOW.getTime() + COALESCE_WINDOW_MS);
    expect(row.body).toBe("v1");
  });

  it("collapses repeated edits to the same record into one row of the final state", async () => {
    const f = createFakes(NOW);
    const notifier = createNotifier(f);

    await notifier.notify(patternEdit({ body: "v1" }));
    f.clock.now = () => new Date(NOW.getTime() + 2 * 60_000); // +2 min
    await notifier.notify(patternEdit({ body: "v2" }));
    f.clock.now = () => new Date(NOW.getTime() + 4 * 60_000); // +4 min
    await notifier.notify(patternEdit({ body: "v3" }));

    expect(f.queue.size).toBe(1);
    const [row] = [...f.queue.values()];
    expect(row.body).toBe("v3");
    // Window rolls forward from the *last* edit.
    expect(row.sendAfter.getTime()).toBe(NOW.getTime() + 4 * 60_000 + COALESCE_WINDOW_MS);
  });

  it("gives different records independent windows", async () => {
    const f = createFakes(NOW);
    const notifier = createNotifier(f);

    await notifier.notify(
      notification({
        event: CLOSURE_ADDED_EVENT,
        coalesceKey: `${CLOSURE_ADDED_EVENT}:household-1:2025-06-01`,
      }),
    );
    await notifier.notify(
      notification({
        event: CLOSURE_ADDED_EVENT,
        coalesceKey: `${CLOSURE_ADDED_EVENT}:household-1:2025-06-02`,
      }),
    );

    expect(f.queue.size).toBe(2);
  });

  it("throws if a coalescable event arrives without a coalesceKey", async () => {
    const f = createFakes(NOW);
    await expect(
      createNotifier(f).notify(notification({ event: CHILDCARE_PATTERN_CHANGED_EVENT })),
    ).rejects.toThrow(/coalesceKey/);
  });
});

describe("flushPendingNotifications", () => {
  const queuePatternEdit = async (f: ReturnType<typeof createFakes>) => {
    await createNotifier(f).notify(
      notification({
        event: CHILDCARE_PATTERN_CHANGED_EVENT,
        coalesceKey: `${CHILDCARE_PATTERN_CHANGED_EVENT}:household-1`,
        title: "The childcare pattern changed",
        body: "final state",
      }),
    );
  };

  it("sends nothing while the window is still open", async () => {
    const f = createFakes(NOW);
    await queuePatternEdit(f);

    f.clock.now = () => new Date(NOW.getTime() + 4 * 60_000); // +4 min, window is 5
    const sent = await flushPendingNotifications(f);

    expect(sent).toBe(0);
    expect(f.emails).toEqual([]);
    expect(f.queue.size).toBe(1);
  });

  it("dispatches and clears a row once its window has elapsed", async () => {
    const f = createFakes(NOW);
    await queuePatternEdit(f);

    f.clock.now = () => new Date(NOW.getTime() + 6 * 60_000); // +6 min
    const sent = await flushPendingNotifications(f);

    expect(sent).toBe(1);
    expect(f.emails).toEqual([
      { to: "alex@example.com", subject: "The childcare pattern changed", body: "final state" },
    ]);
    expect(f.pushes).toHaveLength(1);
    expect(f.queue.size).toBe(0);
  });

  it("one un-sendable row does not strand the rest of the batch, and flush never throws", async () => {
    const f = createFakes(NOW);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    f.mailer.send = async (m) => {
      if (m.body === "poison") throw new Error("Gmail SMTP 422");
      f.emails.push(m);
    };
    const notifier = createNotifier(f);

    await notifier.notify(
      notification({
        event: CHILDCARE_PATTERN_CHANGED_EVENT,
        coalesceKey: "k-poison",
        title: "x",
        body: "poison",
      }),
    );
    await notifier.notify(
      notification({
        event: CLOSURE_ADDED_EVENT,
        coalesceKey: "k-good",
        title: "Closure added",
        body: "good",
      }),
    );

    f.clock.now = () => new Date(NOW.getTime() + 6 * 60_000);
    const sent = await flushPendingNotifications(f);

    expect(sent).toBe(1);
    expect(f.emails.map((e) => e.body)).toEqual(["good"]);
    expect(f.queue.size).toBe(0); // both rows were claimed (delete-then-send)
  });

  it("an edit after the window has flushed sends a second notification", async () => {
    const f = createFakes(NOW);
    const notifier = createNotifier(f);

    await queuePatternEdit(f);
    f.clock.now = () => new Date(NOW.getTime() + 6 * 60_000);
    await flushPendingNotifications(f);
    expect(f.emails).toHaveLength(1);

    // A fresh edit, well after the first window closed.
    f.clock.now = () => new Date(NOW.getTime() + 20 * 60_000);
    await notifier.notify(
      notification({
        event: CHILDCARE_PATTERN_CHANGED_EVENT,
        coalesceKey: `${CHILDCARE_PATTERN_CHANGED_EVENT}:household-1`,
        body: "second change",
      }),
    );
    f.clock.now = () => new Date(NOW.getTime() + 30 * 60_000);
    await flushPendingNotifications(f);

    expect(f.emails).toHaveLength(2);
    expect(f.emails[1].body).toBe("second change");
  });
});

describe("dispatch — the app-icon badge count (issue #134)", () => {
  it("carries the recipient's unresolved count on the push", async () => {
    const f = createFakes(NOW);
    f.openRequests.count = 3;

    await createNotifier(f).notify(notification());

    expect(f.pushes).toHaveLength(1);
    expect(f.pushes[0].badge).toBe(3);
  });

  it("sends a zero count so a resolved last request takes the badge off", async () => {
    // The badge rides on *every* push, not just the request events — that is
    // what makes it self-correcting: the withdrawal notification itself is what
    // clears the icon the withdrawn request had lit up.
    const f = createFakes(NOW);
    f.openRequests.count = 0;

    await createNotifier(f).notify(notification());

    expect(f.pushes[0].badge).toBe(0);
  });

  it("reads the count at flush time, not when the notification was queued", async () => {
    // A coalesced notification can sit in the queue for five minutes (ADR-0012).
    // The icon should show what is true when it is sent.
    const f = createFakes(NOW);
    f.openRequests.count = 1;

    await createNotifier(f).notify(
      notification({
        event: CHILDCARE_PATTERN_CHANGED_EVENT,
        coalesceKey: `${CHILDCARE_PATTERN_CHANGED_EVENT}:household-1`,
      }),
    );
    expect(f.pushes).toEqual([]);

    f.openRequests.count = 2;
    f.clock.now = () => new Date(NOW.getTime() + COALESCE_WINDOW_MS + 1);
    await flushPendingNotifications(f);

    expect(f.pushes).toHaveLength(1);
    expect(f.pushes[0].badge).toBe(2);
  });

  it("still sends both channels when the count can't be read, minus the badge", async () => {
    // The badge is a nicety; the notification is the point. A failed count costs
    // the icon its number, never the parent their notification — and the absent
    // `badge` makes `sw.js` leave whatever is on the icon alone.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = createFakes(NOW);
    f.pickupRequests.countOpenForRecipient = async () => {
      throw new Error("db down");
    };

    await expect(createNotifier(f).notify(notification())).resolves.toBeUndefined();

    expect(f.emails).toHaveLength(1);
    expect(f.pushes).toHaveLength(1);
    expect(f.pushes[0].badge).toBeUndefined();
  });
});
