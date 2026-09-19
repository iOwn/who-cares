/**
 * `bundleNotifications` (issue #131, ADR-0018) — the pure rule behind "one
 * action is one notification per (recipient, event)".
 *
 * The cases that matter are the ones the issue's table names: a two-week absence
 * cancel, a cron tick that finds many at-risk days, a batch inbox answer, a
 * holiday week of closures. Each is just "N notifications of the same kind from
 * one action", so they are covered here by shape rather than by re-staging each
 * feature.
 *
 * Pure, no fakes, no clock (`docs/testing.md` §4).
 */

import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_STANDS_EVENT,
  bundleNotifications,
  CLOSURE_ADDED_EVENT,
  DAY_AT_RISK_BOTH_ABSENT_EVENT,
  listSubjects,
  MAX_LISTED_SUBJECTS,
  type Notification,
  PICKUP_REQUEST_ACCEPTED_EVENT,
  PICKUP_REQUEST_WITHDRAWN_EVENT,
} from "@/domain";
import { MEMBER_1_ID, MEMBER_2_ID } from "@/testing";

const withdrawal = (date: string, recipientId = MEMBER_1_ID): Notification => ({
  recipientId,
  event: PICKUP_REQUEST_WITHDRAWN_EVENT,
  title: "Alex's absence changed",
  body: `Alex's absence changed, so their pickup request for ${date} was withdrawn.`,
  subjectLabel: date,
});

describe("bundleNotifications — grouping", () => {
  it("passes an empty batch straight through", () => {
    expect(bundleNotifications([])).toEqual([]);
  });

  it("leaves a single notification byte-for-byte untouched", () => {
    const one = withdrawal("2025-01-08");
    const [bundled] = bundleNotifications([one]);
    expect(bundled).toBe(one);
  });

  it("collapses a (recipient, event) group into one notification", () => {
    const bundled = bundleNotifications([
      withdrawal("2025-01-08"),
      withdrawal("2025-01-09"),
      withdrawal("2025-01-10"),
    ]);

    expect(bundled).toHaveLength(1);
    expect(bundled[0].recipientId).toBe(MEMBER_1_ID);
    expect(bundled[0].event).toBe(PICKUP_REQUEST_WITHDRAWN_EVENT);
  });

  it("keeps different recipients apart — the cron's two parents get one each", () => {
    const atRisk = (date: string, recipientId: string): Notification => ({
      recipientId,
      event: DAY_AT_RISK_BOTH_ABSENT_EVENT,
      title: `Pickup on ${date} needs a plan`,
      body: "…",
      subjectLabel: date,
    });

    const bundled = bundleNotifications([
      atRisk("2025-01-08", MEMBER_1_ID),
      atRisk("2025-01-08", MEMBER_2_ID),
      atRisk("2025-01-09", MEMBER_1_ID),
      atRisk("2025-01-09", MEMBER_2_ID),
    ]);

    expect(bundled).toHaveLength(2);
    expect(bundled.map((n) => n.recipientId)).toEqual([MEMBER_1_ID, MEMBER_2_ID]);
    for (const notice of bundled) {
      expect(notice.title).toBe("2 pickups need a plan");
    }
  });

  it("keeps different events apart for the same recipient", () => {
    const bundled = bundleNotifications([
      withdrawal("2025-01-08"),
      withdrawal("2025-01-09"),
      {
        recipientId: MEMBER_1_ID,
        event: ASSIGNMENT_STANDS_EVENT,
        title: "You're still on pickup for 2025-01-08",
        body: "…",
        subjectLabel: "2025-01-08",
      },
    ]);

    expect(bundled.map((n) => n.event)).toEqual([
      PICKUP_REQUEST_WITHDRAWN_EVENT,
      ASSIGNMENT_STANDS_EVENT,
    ]);
  });

  it("keeps groups in the order their first member arrived", () => {
    const bundled = bundleNotifications([
      withdrawal("2025-01-08", MEMBER_2_ID),
      withdrawal("2025-01-08", MEMBER_1_ID),
      withdrawal("2025-01-09", MEMBER_2_ID),
      withdrawal("2025-01-09", MEMBER_1_ID),
    ]);

    expect(bundled.map((n) => n.recipientId)).toEqual([MEMBER_2_ID, MEMBER_1_ID]);
  });
});

describe("bundleNotifications — copy", () => {
  it("is count-aware and lists the days", () => {
    const [bundled] = bundleNotifications([
      withdrawal("2025-01-08"),
      withdrawal("2025-01-09"),
      withdrawal("2025-01-10"),
    ]);

    expect(bundled.title).toBe("3 pickup requests were withdrawn");
    expect(bundled.body).toContain("2025-01-08, 2025-01-09 and 2025-01-10");
  });

  it("keeps the batch inbox answer to one accepted notice", () => {
    const accepted = (date: string): Notification => ({
      recipientId: MEMBER_1_ID,
      event: PICKUP_REQUEST_ACCEPTED_EVENT,
      title: "Bailey is covering pickup",
      body: `Bailey accepted your pickup request for ${date}.`,
      subjectLabel: date,
    });

    const [bundled] = bundleNotifications(["2025-01-08", "2025-01-09"].map(accepted));

    expect(bundled.title).toBe("2 of your pickup requests were accepted");
    expect(bundled.body).toContain("2025-01-08 and 2025-01-09");
  });

  it("reads plainly for a holiday week of closures", () => {
    const closure = (date: string): Notification => ({
      recipientId: MEMBER_1_ID,
      event: CLOSURE_ADDED_EVENT,
      title: `Closure added for ${date}`,
      body: "…",
      subjectLabel: date,
    });

    const [bundled] = bundleNotifications(
      ["2025-06-02", "2025-06-03", "2025-06-04", "2025-06-05", "2025-06-06"].map(closure),
    );

    expect(bundled.title).toBe("5 closures added");
    expect(bundled.body).toBe(
      "5 days on 2025-06-02, 2025-06-03, 2025-06-04, 2025-06-05 and 2025-06-06 are now marked closed — there's no childcare pickup on them.",
    );
  });

  it("drops the day clause entirely when nothing carried a subject label", () => {
    const unlabelled = (): Notification => ({
      recipientId: MEMBER_1_ID,
      event: PICKUP_REQUEST_WITHDRAWN_EVENT,
      title: "t",
      body: "b",
    });

    const [bundled] = bundleNotifications([unlabelled(), unlabelled()]);

    expect(bundled.body).not.toContain(" on ");
    expect(bundled.body).toContain("2 pickup requests");
  });

  it("never lists the same day twice", () => {
    // Both a withdrawal and a claim on one day are the same (recipient, event)
    // in the request-withdrawn case; the day is still one day.
    const [bundled] = bundleNotifications([withdrawal("2025-01-08"), withdrawal("2025-01-08")]);

    expect(bundled.body).toContain("on 2025-01-08 ");
    expect(bundled.body.match(/2025-01-08/g)).toHaveLength(1);
  });
});

describe("listSubjects", () => {
  it("joins one, two and several the way a sentence reads", () => {
    expect(listSubjects([])).toBe("");
    expect(listSubjects(["a"])).toBe("a");
    expect(listSubjects(["a", "b"])).toBe("a and b");
    expect(listSubjects(["a", "b", "c"])).toBe("a, b and c");
  });

  it("truncates a long list rather than dumping a fortnight of dates", () => {
    const many = Array.from({ length: MAX_LISTED_SUBJECTS + 4 }, (_, i) => `d${i}`);
    const listed = listSubjects(many);

    expect(listed).toBe(`${many.slice(0, MAX_LISTED_SUBJECTS).join(", ")} and 4 more`);
  });

  it("lists exactly MAX_LISTED_SUBJECTS in full", () => {
    const exactly = Array.from({ length: MAX_LISTED_SUBJECTS }, (_, i) => `d${i}`);
    expect(listSubjects(exactly)).not.toContain("more");
  });
});
