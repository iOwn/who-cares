import { describe, expect, it } from "vitest";
import type { Absence, PickupRequest } from "@/domain";
import {
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeAbsence,
  makeHousehold,
  makeMember,
  makePickupRequest,
  pattern,
} from "@/testing";
import type { DayStateFacts } from "./dayState";
import {
  buildDayStateFacts,
  DEFAULT_ESCALATION_HORIZON_DAYS,
  loadNeedsAttentionCount,
  needsAttentionCount,
} from "./needsAttention";

const NOW = new Date("2025-01-06T08:00:00.000Z"); // a Monday
const day = (date: string, over: Partial<DayStateFacts> = {}): DayStateFacts => ({
  date,
  isChildcareDay: true,
  assignment: null,
  openRequest: null,
  absentMemberIds: [],
  ...over,
});
const bothAbsent = (date: string) => day(date, { absentMemberIds: [MEMBER_1_ID, MEMBER_2_ID] });
const openRequest = (date: string, recipientId = MEMBER_1_ID) =>
  makePickupRequest({
    date,
    state: "Open",
    recipientId,
    requesterId: recipientId === MEMBER_1_ID ? MEMBER_2_ID : MEMBER_1_ID,
    raisedAt: NOW,
  });

describe("needsAttentionCount", () => {
  it("is 0 with nothing waiting", () => {
    expect(
      needsAttentionCount({
        memberId: MEMBER_1_ID,
        requests: [],
        days: [day("2025-01-08")],
        now: NOW,
      }),
    ).toBe(0);
  });

  it("counts open requests addressed to the member only", () => {
    const requests = [openRequest("2025-01-20"), openRequest("2025-01-21", MEMBER_2_ID)];
    expect(needsAttentionCount({ memberId: MEMBER_1_ID, requests, days: [], now: NOW })).toBe(1);
  });

  it("counts at-risk days even when no request is open (the event 9 case)", () => {
    expect(
      needsAttentionCount({
        memberId: MEMBER_1_ID,
        requests: [],
        days: [bothAbsent("2025-01-08"), bothAbsent("2025-01-09")],
        now: NOW,
      }),
    ).toBe(2);
  });

  it("adds requests and at-risk days", () => {
    expect(
      needsAttentionCount({
        memberId: MEMBER_1_ID,
        requests: [openRequest("2025-01-20")],
        days: [bothAbsent("2025-01-08")],
        now: NOW,
      }),
    ).toBe(2);
  });

  it("counts an escalated day that is also my open request once", () => {
    const request = openRequest("2025-01-07"); // < 48h out → at-risk
    expect(
      needsAttentionCount({
        memberId: MEMBER_1_ID,
        requests: [request],
        days: [day("2025-01-07", { openRequest: request })],
        now: NOW,
      }),
    ).toBe(1);
  });

  it("does not count Pending, Resolved or non-childcare days", () => {
    const pending = openRequest("2025-02-03");
    expect(
      needsAttentionCount({
        memberId: MEMBER_2_ID,
        requests: [pending],
        days: [
          day("2025-02-03", { openRequest: pending }),
          day("2025-01-08", { isChildcareDay: false, absentMemberIds: [MEMBER_1_ID, MEMBER_2_ID] }),
        ],
        now: NOW,
      }),
    ).toBe(0);
  });
});

describe("buildDayStateFacts", () => {
  it("spans today through the horizon inclusive", () => {
    const days = buildDayStateFacts({
      pattern: null,
      closures: [],
      absences: [],
      assignments: [],
      requests: [],
      today: "2025-01-06",
      horizonDays: DEFAULT_ESCALATION_HORIZON_DAYS,
    });
    expect(days).toHaveLength(DEFAULT_ESCALATION_HORIZON_DAYS + 1);
    expect(days[0].date).toBe("2025-01-06");
    expect(days.at(-1)?.date).toBe("2025-02-03");
  });
});

describe("loadNeedsAttentionCount", () => {
  // Monday 2025-01-06 is `today`; the pattern is Mon–Fri.
  const clock = { now: () => NOW };
  const fakes = (over: { absences?: Absence[]; requests?: PickupRequest[] } = {}) => ({
    members: {
      async findById(id: string) {
        return id === MEMBER_1_ID ? makeMember({ id }) : null;
      },
    },
    households: {
      async findById() {
        return makeHousehold();
      },
    },
    childcarePattern: {
      async findByHousehold() {
        return pattern(["mon", "tue", "wed", "thu", "fri"]);
      },
    },
    closures: {
      async listByHousehold() {
        return [];
      },
    },
    absences: {
      async listByHousehold() {
        return over.absences ?? [];
      },
    },
    assignments: {
      async listByHousehold() {
        return [];
      },
    },
    pickupRequests: {
      async listByHousehold() {
        return over.requests ?? [];
      },
    },
    clock,
  });

  it("is what an at-risk push to a member with no open request carries (event 9)", async () => {
    const both = [
      makeAbsence({ memberId: MEMBER_1_ID, startDate: "2025-01-08", endDate: "2025-01-08" }),
      makeAbsence({ memberId: MEMBER_2_ID, startDate: "2025-01-08", endDate: "2025-01-08" }),
    ];
    expect(await loadNeedsAttentionCount(fakes({ absences: both }), MEMBER_1_ID)).toBe(1);
  });

  it("is 0 when nothing is waiting (an FYI push carries a cleared icon)", async () => {
    expect(await loadNeedsAttentionCount(fakes(), MEMBER_1_ID)).toBe(0);
  });

  it("ignores at-risk days beyond the 28-day horizon", async () => {
    const far = [
      makeAbsence({ memberId: MEMBER_1_ID, startDate: "2025-03-05", endDate: "2025-03-05" }),
      makeAbsence({ memberId: MEMBER_2_ID, startDate: "2025-03-05", endDate: "2025-03-05" }),
    ];
    expect(await loadNeedsAttentionCount(fakes({ absences: far }), MEMBER_1_ID)).toBe(0);
  });

  it("is 0 for a member that no longer exists", async () => {
    expect(await loadNeedsAttentionCount(fakes(), "ghost")).toBe(0);
  });
});
