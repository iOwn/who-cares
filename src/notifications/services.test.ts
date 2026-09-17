/**
 * `createNotificationServices` (issue #55) — the app boundary. Its one job
 * beyond wiring is **resilience**: every caller runs `notify` / `flush` /
 * `dispatchAll` *after* its DB transaction has committed, so a send failure
 * must never propagate — it would surface to the user as a failed op they
 * might retry into a double-write. This pins that.
 *
 * It is also where outbound delivery is gated off on a deployment running the
 * E2E test seam (issue #139) — pinned at the bottom. `nodemailer` is mocked
 * (as in `gmailMailer.test.ts`) so a regression there fails the assertion
 * instead of opening a real SMTP connection from the test run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createTransport, sendMail } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => undefined);
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ createTransport }));

import {
  CHILDCARE_PATTERN_CHANGED_EVENT,
  type Mailer,
  type MemberRepository,
  type PendingNotification,
  type PendingNotificationRepository,
  PICKUP_REQUEST_ACCEPTED_EVENT,
  type PickupRequestRepository,
  type PushSubscriptionRepository,
} from "@/domain";
import { MEMBER_1_ID, makeMember } from "@/testing";
import { createNotificationServices } from "./services";

const throwingMailer: Mailer = {
  async send() {
    throw new Error("Gmail SMTP 500");
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
  // Only `countOpenForRecipient` is ever reached from here — it is what
  // `dispatchNotification` reads for the app-icon badge (issue #134).
  const pickupRequests: PickupRequestRepository = {
    async findById() {
      return null;
    },
    async findByDate() {
      return null;
    },
    async listByHousehold() {
      return [];
    },
    async countOpenForRecipient() {
      return 0;
    },
    async save() {},
  };
  return { members, pushSubscriptions, pendingNotifications, pickupRequests };
}

beforeEach(() => {
  createTransport.mockClear();
  sendMail.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
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

describe("createNotificationServices — outbound delivery on a test-seam deploy", () => {
  const notification = {
    recipientId: MEMBER_1_ID,
    event: PICKUP_REQUEST_ACCEPTED_EVENT,
    title: "t",
    body: "b",
  } as const;

  /** What the Vercel preview deploy actually looks like: real creds, seam armed. */
  function stubPreviewEnv(testMode: string | null) {
    vi.stubEnv("GMAIL_USER", "who.cares@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
    vi.stubEnv("VERCEL_ENV", "preview");
    if (testMode === null) vi.stubEnv("E2E_TEST_MODE", undefined);
    else vi.stubEnv("E2E_TEST_MODE", testMode);
  }

  it("builds no Gmail transport at all when E2E_TEST_MODE is on", async () => {
    stubPreviewEnv("1");

    await createNotificationServices(repos()).dispatchAll([notification]);

    // The seeded smoke household carries the two allowlisted addresses, so a
    // send here lands real mail in a real inbox (issue #139).
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("still sends when the seam is off and credentials are present", async () => {
    stubPreviewEnv(null);

    await createNotificationServices(repos()).dispatchAll([notification]);

    expect(createTransport).toHaveBeenCalledWith({
      service: "gmail",
      auth: { user: "who.cares@gmail.com", pass: "abcdefghijklmnop" },
    });
    expect(sendMail).toHaveBeenCalled();
  });

  it("an explicit mailer override still wins over the gate (unit tests keep working)", async () => {
    stubPreviewEnv("1");
    const send = vi.fn(async () => undefined);

    await createNotificationServices(repos(), { mailer: { send } }).dispatchAll([notification]);

    expect(send).toHaveBeenCalled();
  });
});
