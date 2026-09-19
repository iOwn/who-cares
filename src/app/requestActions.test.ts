/**
 * The request Server Actions are thin adapters (ADR-0005) and are not
 * unit-tested for their domain behaviour — that lives in
 * `pickupRequestResolution.ts`. `answerAllRequestsAction` is the deliberate
 * exception, on the same grounds as `settings/childcareActions.test.ts`: it
 * holds a loop with rules of its own that no domain test and no E2E smoke
 * (ADR-0008 never asserts dispatch) can cover —
 *
 *   - the whole batch is **one** `dispatchAll` call, which is what makes
 *     "Accept all" one mail instead of five (issue #131, ADR-0018);
 *   - a stale id is **skipped**, not fatal, because the inbox a member taps can
 *     be seconds behind the other parent;
 *   - anything that isn't a stale id rolls the whole transaction back.
 *
 * The domain services underneath are the **real** ones over in-memory
 * repositories, so this also pins that the loop hasn't grown a second
 * implementation of accept / decline.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Assignment, Notification, PickupRequest } from "@/domain";
import {
  HOUSEHOLD_ID,
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeHousehold,
  makeMember,
  makePickupRequest,
} from "@/testing";

const dispatchAll = vi.fn(async (_notifications: readonly Notification[]) => {});

/** In-memory stand-ins for the repositories the resolution services touch. */
const store = {
  requests: new Map<string, PickupRequest>(),
  assignments: new Map<string, Assignment>(),
  /** Set to make `pickupRequests.save` blow up — the "real failure" case. */
  saveThrows: false,
};

const repos = {
  pickupRequests: {
    async findById(id: string) {
      return store.requests.get(id) ?? null;
    },
    async save(request: PickupRequest) {
      if (store.saveThrows) throw new Error("connection reset");
      store.requests.set(request.id, request);
    },
  },
  assignments: {
    async findByDate(_householdId: string, date: string) {
      return [...store.assignments.values()].find((a) => a.date === date) ?? null;
    },
    async save(assignment: Assignment) {
      store.assignments.set(assignment.id, assignment);
    },
  },
  members: {
    async listByHousehold() {
      return [
        makeMember({ id: MEMBER_1_ID, name: "Alex" }),
        makeMember({ id: MEMBER_2_ID, name: "Bailey" }),
      ];
    },
  },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({
  // The signed-in member is the one the seeded requests are addressed to.
  getCurrentSession: vi.fn(async () => ({
    member: makeMember({ id: MEMBER_2_ID, name: "Bailey" }),
    household: makeHousehold({ id: HOUSEHOLD_ID }),
  })),
}));
vi.mock("@/auth/config", () => ({
  db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock("@/db/repositories", () => ({ createRepositories: () => repos }));
vi.mock("@/notifications", async (importActual) => ({
  ...(await importActual<typeof import("@/notifications")>()),
  notificationServicesFor: () => ({ notifier: { notify: vi.fn() }, dispatchAll }),
}));

const { answerAllRequestsAction } = await import("./requestActions");

/** Three open requests to Bailey, one per day. */
function seedOpenRequests(): PickupRequest[] {
  const dates = ["2025-01-08", "2025-01-09", "2025-01-10"];
  return dates.map((date, i) => {
    const request = makePickupRequest({ id: `req-${i}`, date, state: "Open" });
    store.requests.set(request.id, request);
    return request;
  });
}

const ids = () => [...store.requests.keys()];
/** The one batch handed to `dispatchAll`. */
const dispatched = (): readonly Notification[] => dispatchAll.mock.calls.at(-1)?.[0] ?? [];

beforeEach(() => {
  dispatchAll.mockClear();
  store.requests.clear();
  store.assignments.clear();
  store.saveThrows = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("answerAllRequestsAction — accept", () => {
  it("answers every request and dispatches the whole batch in one call", async () => {
    seedOpenRequests();

    const result = await answerAllRequestsAction(ids(), "accept");

    expect(result).toEqual({ ok: true, answered: 3, skipped: 0 });
    expect([...store.requests.values()].map((r) => r.state)).toEqual([
      "Accepted",
      "Accepted",
      "Accepted",
    ]);
    // One call, three notifications — `dispatchAll` is what bundles them.
    expect(dispatchAll).toHaveBeenCalledTimes(1);
    expect(dispatched()).toHaveLength(3);
    expect(dispatched().map((n) => n.subjectLabel)).toEqual([
      "2025-01-08",
      "2025-01-09",
      "2025-01-10",
    ]);
  });

  it("writes one assignment per accepted day", async () => {
    seedOpenRequests();

    await answerAllRequestsAction(ids(), "accept");

    expect([...store.assignments.values()].map((a) => a.date)).toEqual([
      "2025-01-08",
      "2025-01-09",
      "2025-01-10",
    ]);
  });

  it("does nothing, and sends nothing, for an empty selection", async () => {
    const result = await answerAllRequestsAction([], "accept");

    expect(result).toEqual({ ok: true, answered: 0, skipped: 0 });
    expect(dispatchAll).not.toHaveBeenCalled();
  });
});

describe("answerAllRequestsAction — decline", () => {
  it("declines every request", async () => {
    seedOpenRequests();

    const result = await answerAllRequestsAction(ids(), "decline");

    expect(result).toEqual({ ok: true, answered: 3, skipped: 0 });
    expect([...store.requests.values()].every((r) => r.state === "Declined")).toBe(true);
    expect(store.assignments.size).toBe(0);
  });
});

describe("answerAllRequestsAction — stale ids", () => {
  it("skips a request that is no longer Open and still answers the rest", async () => {
    const [first, ...rest] = seedOpenRequests();
    store.requests.set(first.id, { ...first, state: "Declined" });

    const result = await answerAllRequestsAction(ids(), "accept");

    expect(result).toEqual({ ok: true, answered: 2, skipped: 1 });
    expect(store.requests.get(first.id)?.state).toBe("Declined");
    for (const request of rest) {
      expect(store.requests.get(request.id)?.state).toBe("Accepted");
    }
  });

  it("skips an id that names nothing at all", async () => {
    seedOpenRequests();

    const result = await answerAllRequestsAction([...ids(), "vanished"], "accept");

    expect(result).toEqual({ ok: true, answered: 3, skipped: 1 });
  });

  it("sends nothing when every id turned out to be stale", async () => {
    const requests = seedOpenRequests();
    for (const request of requests) {
      store.requests.set(request.id, { ...request, state: "Withdrawn" });
    }

    const result = await answerAllRequestsAction(ids(), "accept");

    expect(result).toEqual({ ok: true, answered: 0, skipped: 3 });
    expect(dispatched()).toEqual([]);
  });
});

describe("answerAllRequestsAction — a real failure", () => {
  it("reports a generic error and dispatches nothing", async () => {
    seedOpenRequests();
    store.saveThrows = true;

    const result = await answerAllRequestsAction(ids(), "accept");

    expect(result).toEqual({ ok: false, error: "Something went wrong. Please try again." });
    expect(dispatchAll).not.toHaveBeenCalled();
  });
});
