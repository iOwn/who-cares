/**
 * The childcare-settings Server Actions are thin adapters (ADR-0005) and are not
 * unit-tested for their domain behaviour — that lives in `childcareDay.ts`.
 * This file guards the cross-cutting contracts the notification rewrite
 * (issue #131, ADR-0018) rests on:
 *
 *   - a closure **range** writes one `Closure` row per date (CONTEXT.md keeps a
 *     closure a single day) but is **one action**, so it hands `dispatchAll` one
 *     batch and the other parent gets one bundled notification;
 *   - event 12 still fires on an *add* only, so a range that overlaps days
 *     already closed notifies about the new ones alone;
 *   - nothing here flushes a queue any more — there is no queue.
 *
 * The wiring (`db`, auth, repositories, the notification services) is `vi.mock`ed
 * — a `"use server"` module cannot take injection.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSURE_ADDED_EVENT, MAX_CLOSURE_RANGE_DAYS, type Notification } from "@/domain";
import { HOUSEHOLD_ID, MEMBER_1_ID, MEMBER_2_ID, makeHousehold, makeMember } from "@/testing";

const notify = vi.fn(async () => {});
const dispatchAll = vi.fn(async (_notifications: readonly Notification[]) => {});

const repos = {
  childcarePattern: {
    findByHousehold: vi.fn(async (): Promise<{ versions: unknown[] } | null> => null),
    save: vi.fn(async () => {}),
  },
  closures: {
    findByDate: vi.fn(
      async (
        _householdId: string,
        _date: string,
      ): Promise<{ id: string; householdId: string } | null> => null,
    ),
    listByHousehold: vi.fn(async (): Promise<{ id: string }[]> => []),
    save: vi.fn(async (_closure: { id: string; date: string }) => {}),
    delete: vi.fn(async () => {}),
  },
  members: {
    listByHousehold: vi.fn(async () => [
      makeMember({ id: MEMBER_1_ID }),
      makeMember({ id: MEMBER_2_ID }),
    ]),
  },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({
  getCurrentSession: vi.fn(async () => ({
    member: makeMember({ id: MEMBER_1_ID, name: "Alex" }),
    household: makeHousehold({ id: HOUSEHOLD_ID }),
  })),
}));
vi.mock("@/auth/config", () => ({
  db: { transaction: async (fn: (tx: unknown) => unknown) => fn({}) },
}));
vi.mock("@/db/repositories", () => ({ createRepositories: () => repos }));
vi.mock("@/notifications", async (importActual) => ({
  ...(await importActual<typeof import("@/notifications")>()),
  notificationServicesFor: () => ({ notifier: { notify }, dispatchAll }),
}));

const { removeClosureAction, saveClosureAction, savePatternAction } = await import(
  "./childcareActions"
);

/** The dates the action actually wrote, in order. */
const savedDates = () => repos.closures.save.mock.calls.map(([closure]) => closure.date);
/** The one batch handed to `dispatchAll`. */
const dispatched = (): readonly Notification[] => dispatchAll.mock.calls.at(-1)?.[0] ?? [];

beforeEach(() => {
  notify.mockClear();
  dispatchAll.mockClear();
  repos.closures.save.mockClear();
  repos.closures.delete.mockClear();
  repos.childcarePattern.findByHousehold.mockResolvedValue(null);
  repos.closures.findByDate.mockResolvedValue(null);
  repos.closures.listByHousehold.mockResolvedValue([]);
});

describe("saveClosureAction — a range is one action (issue #131)", () => {
  it("writes one closure row per date in the range", async () => {
    await saveClosureAction({ date: "2025-06-02", endDate: "2025-06-06" });

    expect(savedDates()).toEqual([
      "2025-06-02",
      "2025-06-03",
      "2025-06-04",
      "2025-06-05",
      "2025-06-06",
    ]);
  });

  it("hands the whole range to dispatchAll in one call, to be bundled", async () => {
    await saveClosureAction({ date: "2025-06-02", endDate: "2025-06-04" });

    expect(dispatchAll).toHaveBeenCalledTimes(1);
    expect(dispatched().map((n) => n.subjectLabel)).toEqual([
      "2025-06-02",
      "2025-06-03",
      "2025-06-04",
    ]);
    for (const notification of dispatched()) {
      expect(notification.event).toBe(CLOSURE_ADDED_EVENT);
      expect(notification.recipientId).toBe(MEMBER_2_ID); // the non-actor
    }
  });

  it("treats a missing endDate as a single day", async () => {
    await saveClosureAction({ date: "2025-06-02" });

    expect(savedDates()).toEqual(["2025-06-02"]);
    expect(dispatched()).toHaveLength(1);
  });

  it("notifies only about the days it actually added", async () => {
    // The middle day is already closed — the row is rewritten, but event 12
    // fires on an *add*, so it is not in the batch.
    repos.closures.findByDate.mockImplementation(async (_h: string, date: string) =>
      date === "2025-06-03" ? { id: "existing", householdId: HOUSEHOLD_ID } : null,
    );

    await saveClosureAction({ date: "2025-06-02", endDate: "2025-06-04" });

    expect(savedDates()).toEqual(["2025-06-02", "2025-06-03", "2025-06-04"]);
    expect(dispatched().map((n) => n.subjectLabel)).toEqual(["2025-06-02", "2025-06-04"]);
  });

  it("sends nothing when every day in the range was already closed", async () => {
    repos.closures.findByDate.mockResolvedValue({ id: "existing", householdId: HOUSEHOLD_ID });

    await saveClosureAction({ date: "2025-06-02", endDate: "2025-06-03" });

    expect(dispatchAll).not.toHaveBeenCalled();
  });

  it("rejects an end before the start", async () => {
    await expect(saveClosureAction({ date: "2025-06-06", endDate: "2025-06-02" })).rejects.toThrow(
      /can't be before/,
    );
    expect(repos.closures.save).not.toHaveBeenCalled();
  });

  it("caps how many days one action may close", async () => {
    await expect(saveClosureAction({ date: "2025-01-01", endDate: "2025-12-31" })).rejects.toThrow(
      new RegExp(String(MAX_CLOSURE_RANGE_DAYS)),
    );
    expect(repos.closures.save).not.toHaveBeenCalled();
  });

  it("ignores a range when editing — an edit is always the one row", async () => {
    repos.closures.listByHousehold.mockResolvedValue([{ id: "c1" }]);
    repos.closures.findByDate.mockResolvedValue({ id: "c1", householdId: HOUSEHOLD_ID });

    await saveClosureAction({ id: "c1", date: "2025-06-02", endDate: "2025-06-06" });

    expect(savedDates()).toEqual(["2025-06-02"]);
    expect(dispatchAll).not.toHaveBeenCalled();
  });
});

describe("savePatternAction", () => {
  it("notifies the other member once on a real change", async () => {
    await savePatternAction({ weekdays: ["mon"], effectiveFrom: "2025-01-06" });

    expect(dispatchAll).toHaveBeenCalledTimes(1);
    expect(dispatched()).toHaveLength(1);
    expect(dispatched()[0].recipientId).toBe(MEMBER_2_ID);
  });
});

describe("removeClosureAction", () => {
  it("deletes a closure this household owns", async () => {
    repos.closures.listByHousehold.mockResolvedValue([{ id: "c1" }]);

    await removeClosureAction("c1");

    expect(repos.closures.delete).toHaveBeenCalledWith("c1");
  });

  it("bails on a foreign closure id", async () => {
    repos.closures.listByHousehold.mockResolvedValue([{ id: "mine" }]);

    await removeClosureAction("someone-elses");

    expect(repos.closures.delete).not.toHaveBeenCalled();
  });
});
