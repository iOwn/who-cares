/**
 * `PushSubscriptionRepository` + `PendingNotificationRepository` +
 * `AtRiskEscalationRepository` against a real, migration-built schema
 * (ADR-0006, issue #55).
 *
 * The seam under test is narrow: the queries round-trip their shapes, and the
 * three uniqueness guards hold — `push_subscriptions.endpoint`,
 * `pending_notifications.coalesce_key`, `at_risk_escalations (household, date)`.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, type Repositories } from "@/db";
import {
  closeTestDatabase,
  createTestDatabase,
  HOUSEHOLD_ID,
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeTypicalHousehold,
  seed,
  truncateAll,
} from "@/testing";

const db = await createTestDatabase();
const repos: Repositories = createRepositories(db);

afterAll(async () => {
  await closeTestDatabase(db);
});

beforeEach(async () => {
  await truncateAll(db);
  await seed(db, makeTypicalHousehold());
});

describe("PushSubscriptionRepository", () => {
  const sub = (over: Partial<Parameters<typeof repos.pushSubscriptions.save>[0]> = {}) => ({
    id: "sub-1",
    memberId: MEMBER_1_ID,
    endpoint: "https://push.example/abc",
    p256dh: "key-p256dh",
    auth: "key-auth",
    ...over,
  });

  it("saves and lists a member's subscriptions", async () => {
    await repos.pushSubscriptions.save(sub());
    await repos.pushSubscriptions.save(sub({ id: "sub-2", endpoint: "https://push.example/def" }));
    await repos.pushSubscriptions.save(
      sub({ id: "sub-3", memberId: MEMBER_2_ID, endpoint: "https://push.example/ghi" }),
    );

    const forMember1 = await repos.pushSubscriptions.listByMember(MEMBER_1_ID);
    expect(forMember1.map((s) => s.endpoint).sort()).toEqual([
      "https://push.example/abc",
      "https://push.example/def",
    ]);
  });

  it("upserts on endpoint — a re-subscribe refreshes the keys, not a duplicate row", async () => {
    await repos.pushSubscriptions.save(sub());
    await repos.pushSubscriptions.save(sub({ id: "sub-x", p256dh: "rotated", auth: "rotated" }));

    const rows = await repos.pushSubscriptions.listByMember(MEMBER_1_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("rotated");
  });

  it("drops a subscription by endpoint", async () => {
    await repos.pushSubscriptions.save(sub());
    await repos.pushSubscriptions.deleteByEndpoint("https://push.example/abc");
    expect(await repos.pushSubscriptions.listByMember(MEMBER_1_ID)).toEqual([]);
  });
});

describe("PendingNotificationRepository", () => {
  const pending = (
    over: Partial<Parameters<typeof repos.pendingNotifications.upsert>[0]> = {},
  ) => ({
    id: "pn-1",
    coalesceKey: "childcare-pattern-changed:household-1",
    recipientId: MEMBER_2_ID,
    event: "childcare-pattern-changed",
    title: "The childcare pattern changed",
    body: "v1",
    sendAfter: new Date("2025-01-06T09:05:00.000Z"),
    ...over,
  });

  it("upserts on coalesce_key — a second edit replaces the payload and the window", async () => {
    await repos.pendingNotifications.upsert(pending());
    await repos.pendingNotifications.upsert(
      pending({ id: "pn-2", body: "v2", sendAfter: new Date("2025-01-06T09:09:00.000Z") }),
    );

    const due = await repos.pendingNotifications.listDue(new Date("2025-01-06T10:00:00.000Z"));
    expect(due).toHaveLength(1);
    expect(due[0].body).toBe("v2");
    expect(due[0].sendAfter.toISOString()).toBe("2025-01-06T09:09:00.000Z");
  });

  it("listDue respects the window and orders oldest-first", async () => {
    await repos.pendingNotifications.upsert(
      pending({ id: "a", coalesceKey: "k-a", sendAfter: new Date("2025-01-06T09:03:00.000Z") }),
    );
    await repos.pendingNotifications.upsert(
      pending({ id: "b", coalesceKey: "k-b", sendAfter: new Date("2025-01-06T09:01:00.000Z") }),
    );
    await repos.pendingNotifications.upsert(
      pending({ id: "c", coalesceKey: "k-c", sendAfter: new Date("2025-01-06T09:30:00.000Z") }),
    );

    const due = await repos.pendingNotifications.listDue(new Date("2025-01-06T09:05:00.000Z"));
    expect(due.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("deletes a flushed row", async () => {
    await repos.pendingNotifications.upsert(pending());
    await repos.pendingNotifications.delete("pn-1");
    expect(await repos.pendingNotifications.listDue(new Date("2030-01-01T00:00:00.000Z"))).toEqual(
      [],
    );
  });
});

describe("AtRiskEscalationRepository", () => {
  it("records a date and lists it back, once", async () => {
    const at = new Date("2025-01-06T06:00:00.000Z");
    await repos.atRiskEscalations.record(HOUSEHOLD_ID, "2025-01-08", "day-at-risk-both-absent", at);
    // A second run for the same day is a harmless no-op (onConflictDoNothing).
    await repos.atRiskEscalations.record(HOUSEHOLD_ID, "2025-01-08", "day-at-risk-escalated", at);

    expect(await repos.atRiskEscalations.listNotifiedDates(HOUSEHOLD_ID)).toEqual(["2025-01-08"]);
  });

  it("scopes listNotifiedDates to the household", async () => {
    await repos.atRiskEscalations.record(
      HOUSEHOLD_ID,
      "2025-01-08",
      "day-at-risk-both-absent",
      new Date(),
    );
    expect(await repos.atRiskEscalations.listNotifiedDates("other-household")).toEqual([]);
  });
});
