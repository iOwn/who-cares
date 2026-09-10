/**
 * `createWebPushSender` (issue #55) — the `web-push` adapter. `web-push` itself
 * is mocked; the seam under test is subscription resolution, the payload shape,
 * and the "drop a dead endpoint on 404/410, log-and-keep on anything else" rule.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushSubscriptionRepository, StoredPushSubscription } from "@/domain";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({
  default: { sendNotification: (...a: unknown[]) => sendNotification(...a), setVapidDetails },
}));

const { createWebPushSender } = await import("./webPushSender");

const VAPID = { publicKey: "pub", privateKey: "priv", subject: "mailto:x@y.z" };

function repoWith(subs: StoredPushSubscription[]) {
  const deleted: string[] = [];
  const repo: PushSubscriptionRepository = {
    async listByMember() {
      return subs;
    },
    async save() {},
    async deleteByEndpoint(endpoint) {
      deleted.push(endpoint);
    },
  };
  return { repo, deleted };
}

const sub = (over: Partial<StoredPushSubscription> = {}): StoredPushSubscription => ({
  id: "s1",
  memberId: "m1",
  endpoint: "https://push.example/a",
  p256dh: "p",
  auth: "a",
  ...over,
});

beforeEach(() => {
  sendNotification.mockReset();
  setVapidDetails.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("createWebPushSender", () => {
  it("returns null without VAPID config", () => {
    const { repo } = repoWith([]);
    expect(createWebPushSender({ vapid: null, pushSubscriptions: repo })).toBeNull();
  });

  it("posts the payload to every stored subscription for the member", async () => {
    const { repo } = repoWith([
      sub({ endpoint: "https://push.example/a" }),
      sub({ id: "s2", endpoint: "https://push.example/b" }),
    ]);
    sendNotification.mockResolvedValue(undefined);

    const sender = createWebPushSender({ vapid: VAPID, pushSubscriptions: repo });
    await sender?.send({ memberId: "m1", title: "Hi", body: "there" });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [subscription, payload] = sendNotification.mock.calls[0];
    expect(subscription).toEqual({
      endpoint: "https://push.example/a",
      keys: { p256dh: "p", auth: "a" },
    });
    expect(JSON.parse(payload as string)).toEqual({ title: "Hi", body: "there" });
  });

  it("drops a subscription the push service reports as gone (404 / 410)", async () => {
    const { repo, deleted } = repoWith([
      sub({ endpoint: "https://dead" }),
      sub({ id: "s2", endpoint: "https://live" }),
    ]);
    sendNotification.mockImplementation((s: { endpoint: string }) => {
      if (s.endpoint === "https://dead") return Promise.reject({ statusCode: 410 });
      return Promise.resolve(undefined);
    });

    const sender = createWebPushSender({ vapid: VAPID, pushSubscriptions: repo });
    await sender?.send({ memberId: "m1", title: "t", body: "b" });

    expect(deleted).toEqual(["https://dead"]);
  });

  it("keeps a subscription on a transient failure, just logs it", async () => {
    const { repo, deleted } = repoWith([sub()]);
    sendNotification.mockRejectedValue({ statusCode: 429 });

    const sender = createWebPushSender({ vapid: VAPID, pushSubscriptions: repo });
    await sender?.send({ memberId: "m1", title: "t", body: "b" });

    expect(deleted).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });
});
