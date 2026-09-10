/**
 * `createNotificationServices` (issue #55) — the app boundary. Its one job
 * beyond wiring is **resilience**: every caller runs `notify` / `flush` /
 * `dispatchAll` *after* its DB transaction has committed, so a send failure
 * must never propagate — it would surface to the user as a failed op they
 * might retry into a double-write. This pins that.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHILDCARE_PATTERN_CHANGED_EVENT,
  type Mailer,
  type MemberRepository,
  type PendingNotification,
  type PendingNotificationRepository,
  PICKUP_REQUEST_ACCEPTED_EVENT,
  type PushSubscriptionRepository,
} from "@/domain";
import { MEMBER_1_ID, makeMember } from "@/testing";
import { createNotificationServices } from "./services";

const throwingMailer: Mailer = {
  async send() {
    throw new Error("Resend 500");
  },
};

function repos(queue: PendingNotification[] = []) {
  const members: MemberRepository = {
    async findById(id) {
      return id === MEMBER_1_ID ? makeMember({ id: MEMBER_1_ID, email: "a@b.c" }) : null;
    },
    async findByEmail() {
      return null;
    },
    async listByHousehold() {
      return [];
    },
    async save() {},
  };
  const pushSubscriptions: PushSubscriptionRepository = {
    async listByMember() {
      return [];
    },
    async save() {},
    async deleteByEndpoint() {},
  };
  const pendingNotifications: PendingNotificationRepository = {
    async upsert(p) {
      queue.push(p);
    },
    async claimDue(now) {
      const due = queue.filter((r) => r.sendAfter <= now);
      for (const r of due) queue.splice(queue.indexOf(r), 1);
      return due;
    },
  };
  return { members, pushSubscriptions, pendingNotifications };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("createNotificationServices — post-commit resilience", () => {
  it("notify() swallows a mailer failure instead of throwing", async () => {
    const services = createNotificationServices(repos(), { mailer: throwingMailer });
    await expect(
      services.notifier.notify({
        recipientId: MEMBER_1_ID,
        event: PICKUP_REQUEST_ACCEPTED_EVENT,
        title: "t",
        body: "b",
      }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("dispatchAll() swallows a mailer failure", async () => {
    const services = createNotificationServices(repos(), { mailer: throwingMailer });
    await expect(
      services.dispatchAll([
        { recipientId: MEMBER_1_ID, event: PICKUP_REQUEST_ACCEPTED_EVENT, title: "t", body: "b" },
      ]),
    ).resolves.toBeUndefined();
  });

  it("flush() swallows a mailer failure and returns 0", async () => {
    const queue: PendingNotification[] = [
      {
        id: "p1",
        coalesceKey: "k",
        recipientId: MEMBER_1_ID,
        event: CHILDCARE_PATTERN_CHANGED_EVENT,
        title: "t",
        body: "b",
        sendAfter: new Date("2000-01-01T00:00:00.000Z"),
      },
    ];
    const services = createNotificationServices(repos(queue), { mailer: throwingMailer });
    await expect(services.flush()).resolves.toBe(0);
  });
});
