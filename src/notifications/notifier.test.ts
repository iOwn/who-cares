/**
 * The real `Notifier` and its 5-minute coalescing window (issue #55,
 * `docs/testing.md` §4 point 2 — the coalescing-window cases).
 *
 * Pure ports in, fakes injected — no database, no Resend, no `web-push`.
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
    async listDue(at) {
      return [...queue.values()]
        .filter((row) => row.sendAfter <= at)
        .sort((a, b) => a.sendAfter.getTime() - b.sendAfter.getTime());
    },
    async delete(id) {
      for (const [key, row] of queue) if (row.id === id) queue.delete(key);
    },
  };

  const clock = { now: () => new Date(now.getTime()) };
  const newId = () => {
    seq += 1;
    return `pending-${seq}`;
  };

  return { emails, pushes, queue, mailer, pushSender, members, pendingNotifications, clock, newId };
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
