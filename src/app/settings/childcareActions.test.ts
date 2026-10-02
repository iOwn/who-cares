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
/** Mocked so a test can assert the closure range is written as one unit. */
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn({}));
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
    listByHousehold: vi.fn(async (): Promise<{ id: string; date?: string }[]> => []),
    save: vi.fn(async (_closure: { id: string; date: string; needsCover?: boolean }) => {}),
    delete: vi.fn(async (_id: string) => {}),
  },
  members: {
    listByHousehold: vi.fn(async () => [
      makeMember({ id: MEMBER_1_ID }),
      makeMember({ id: MEMBER_2_ID }),
    ]),
  },
  households: {
    findById: vi.fn(async () => makeHousehold({ id: HOUSEHOLD_ID })),
    save: vi.fn(async () => {}),
  },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({
  getCurrentSession: vi.fn(async () => ({
    member: makeMember({ id: MEMBER_1_ID, name: "Alex" }),
    household: makeHousehold({ id: HOUSEHOLD_ID }),
  })),
}));
vi.mock("@/auth/config", () => ({ db: { transaction } }));
vi.mock("@/db/repositories", () => ({ createRepositories: () => repos }));
vi.mock("@/notifications", async (importActual) => ({
  ...(await importActual<typeof import("@/notifications")>()),
  notificationServicesFor: () => ({ notifier: { notify }, dispatchAll }),
}));

const {
  removeClosureAction,
  removeClosuresAction,
  replaceClosureRangeAction,
  saveClosureAction,
  saveClosuresAction,
  savePatternAction,
  setBundeslandAction,
} = await import("./childcareActions");

/** The dates the action actually wrote, in order. */
const savedDates = () => repos.closures.save.mock.calls.map(([closure]) => closure.date);
/** The one batch handed to `dispatchAll`. */
const dispatched = (): readonly Notification[] => dispatchAll.mock.calls.at(-1)?.[0] ?? [];

beforeEach(() => {
  notify.mockClear();
  dispatchAll.mockClear();
  transaction.mockClear();
  repos.closures.save.mockClear();
  repos.closures.delete.mockClear();
  repos.households.save.mockClear();
  repos.childcarePattern.findByHousehold.mockResolvedValue(null);
  repos.closures.findByDate.mockResolvedValue(null);
  repos.closures.listByHousehold.mockResolvedValue([]);
  repos.households.findById.mockResolvedValue(makeHousehold({ id: HOUSEHOLD_ID }));
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

  // Validation comes back as a **result**, never a throw: Next replaces a
  // message thrown out of a Server Action with a generic one plus a digest in a
  // production build, and both of these are messages a real user can trigger.
  it("returns an error for an end before the start", async () => {
    const result = await saveClosureAction({ date: "2025-06-06", endDate: "2025-06-02" });

    expect(result).toEqual({
      ok: false,
      error: "The last closure date can't be before the first.",
    });
    expect(repos.closures.save).not.toHaveBeenCalled();
  });

  it("returns an error past the cap on how many days one action may close", async () => {
    const result = await saveClosureAction({ date: "2025-01-01", endDate: "2025-12-31" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(new RegExp(String(MAX_CLOSURE_RANGE_DAYS)));
    expect(repos.closures.save).not.toHaveBeenCalled();
  });

  it("writes the whole range in one transaction", async () => {
    // A failure part-way through must not leave half a holiday week closed and
    // notify about none of it — `savePatternAction` wraps its write the same way.
    await saveClosureAction({ date: "2025-06-02", endDate: "2025-06-04" });

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("reports a generic error and sends nothing when the write fails", async () => {
    repos.closures.save.mockRejectedValueOnce(new Error("connection reset"));

    const result = await saveClosureAction({ date: "2025-06-02", endDate: "2025-06-04" });

    expect(result).toEqual({
      ok: false,
      error: "Something went wrong saving that. Please try again.",
    });
    expect(dispatchAll).not.toHaveBeenCalled();
  });

  it("ignores a range when editing — an edit is always the one row", async () => {
    repos.closures.listByHousehold.mockResolvedValue([{ id: "c1" }]);
    repos.closures.findByDate.mockResolvedValue({ id: "c1", householdId: HOUSEHOLD_ID });

    await saveClosureAction({ id: "c1", date: "2025-06-02", endDate: "2025-06-06" });

    expect(savedDates()).toEqual(["2025-06-02"]);
    expect(dispatchAll).not.toHaveBeenCalled();
  });
});

describe("saveClosureAction — needsCover (issue #166)", () => {
  it("persists needsCover on every row of the range", async () => {
    await saveClosureAction({ date: "2025-06-02", endDate: "2025-06-03", needsCover: true });

    for (const [closure] of repos.closures.save.mock.calls) {
      expect(closure.needsCover).toBe(true);
    }
  });

  it("omits the flag by default, as before", async () => {
    await saveClosureAction({ date: "2025-06-02" });

    expect(repos.closures.save.mock.calls[0][0]).not.toHaveProperty("needsCover");
  });

  it("an edit can flip the flag and sends nothing", async () => {
    repos.closures.listByHousehold.mockResolvedValue([{ id: "c1" }]);
    repos.closures.findByDate.mockResolvedValue({ id: "c1", householdId: HOUSEHOLD_ID });

    await saveClosureAction({ id: "c1", date: "2025-06-02", needsCover: true });

    expect(repos.closures.save.mock.calls[0][0]).toMatchObject({ id: "c1", needsCover: true });
    expect(dispatchAll).not.toHaveBeenCalled();
  });

  it("the closure-added copy differs per kind", async () => {
    await saveClosureAction({ date: "2025-06-02", needsCover: true });
    expect(dispatched()[0].body).toMatch(/still needs to look after the child/);

    await saveClosureAction({ date: "2025-06-03" });
    expect(dispatched()[0].body).toMatch(/no childcare pickup/);
  });
});

describe("saveClosuresAction — a year of closures in one go (issue #166)", () => {
  const entries = [
    { date: "2026-02-13", reason: "Staff training", needsCover: true },
    { date: "2026-07-27", endDate: "2026-08-14", reason: "Summer break", needsCover: true },
    { date: "2026-12-28", endDate: "2026-12-31", needsCover: true },
  ];

  it("writes every row in one transaction and sends one dispatch", async () => {
    const result = await saveClosuresAction({ entries });

    expect(result).toEqual({ ok: true, addedCount: 1 + 19 + 4 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(dispatchAll).toHaveBeenCalledTimes(1);
    expect(dispatched()).toHaveLength(24);
    expect(savedDates()).toContain("2026-12-31"); // a date a year out
  });

  it("saves nothing and names the row when one is invalid", async () => {
    const result = await saveClosuresAction({
      entries: [entries[0], { date: "2026-08-14", endDate: "2026-08-01" }],
    });

    expect(result).toEqual({
      ok: false,
      error: "Row 2: The last closure date can't be before the first.",
    });
    expect(repos.closures.save).not.toHaveBeenCalled();
    expect(dispatchAll).not.toHaveBeenCalled();
  });

  it("applies the per-range cap, but not a cap across the batch", async () => {
    const tooLong = await saveClosuresAction({
      entries: [{ date: "2026-01-01", endDate: "2026-12-31" }],
    });
    expect(tooLong.ok).toBe(false);

    const manyRanges = Array.from({ length: 12 }, (_, month) => ({
      date: `2026-${String(month + 1).padStart(2, "0")}-01`,
      endDate: `2026-${String(month + 1).padStart(2, "0")}-28`,
    }));
    expect((await saveClosuresAction({ entries: manyRanges })).ok).toBe(true);
  });

  it("resolves overlapping rows to one notification per date", async () => {
    await saveClosuresAction({
      entries: [
        { date: "2026-03-02", endDate: "2026-03-04" },
        { date: "2026-03-04", endDate: "2026-03-05" },
      ],
    });

    expect(dispatched().map((n) => n.subjectLabel)).toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ]);
  });

  it("the notification for an overlapped date follows the later row's kind", async () => {
    // Like the real adapter, `findByDate` sees a row an earlier entry of this batch just wrote.
    const written = new Map<string, { id: string; householdId: string }>();
    repos.closures.save.mockImplementation(async (closure: { id: string; date: string }) => {
      written.set(closure.date, { id: closure.id, householdId: HOUSEHOLD_ID });
    });
    repos.closures.findByDate.mockImplementation(
      async (_h: string, date: string) => written.get(date) ?? null,
    );

    await saveClosuresAction({
      entries: [
        { date: "2026-03-02", endDate: "2026-03-03", needsCover: false },
        { date: "2026-03-03", needsCover: true },
      ],
    });

    const byDate = new Map(dispatched().map((n) => [n.subjectLabel, n.body]));
    expect(byDate.get("2026-03-02")).toMatch(/no childcare pickup/);
    expect(byDate.get("2026-03-03")).toMatch(/still needs to look after the child/);
  });

  it("rejects an empty batch", async () => {
    expect((await saveClosuresAction({ entries: [] })).ok).toBe(false);
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

describe("setBundeslandAction (issue #167, ADR-0020)", () => {
  it("persists the chosen state and notifies the other member once, under event 11", async () => {
    const result = await setBundeslandAction("BY");

    expect(result).toEqual({ ok: true });
    expect(repos.households.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: HOUSEHOLD_ID, bundesland: "BY" }),
    );
    expect(dispatchAll).toHaveBeenCalledTimes(1);
    expect(dispatched()).toHaveLength(1);
    expect(dispatched()[0]).toMatchObject({
      event: "childcare-pattern-changed",
      recipientId: MEMBER_2_ID,
    });
  });

  it("notifies nothing and writes nothing when the same value is re-selected", async () => {
    repos.households.findById.mockResolvedValue(
      makeHousehold({ id: HOUSEHOLD_ID, bundesland: "BY" }),
    );

    const result = await setBundeslandAction("BY");

    expect(result).toEqual({ ok: true });
    expect(repos.households.save).not.toHaveBeenCalled();
    expect(dispatchAll).not.toHaveBeenCalled();
  });

  it("clearing the state back to none also notifies once", async () => {
    repos.households.findById.mockResolvedValue(
      makeHousehold({ id: HOUSEHOLD_ID, bundesland: "BY" }),
    );

    const result = await setBundeslandAction(null);

    expect(result).toEqual({ ok: true });
    expect(repos.households.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: HOUSEHOLD_ID, bundesland: undefined }),
    );
    expect(dispatchAll).toHaveBeenCalledTimes(1);
  });

  it("rejects a value that isn't a recognised state code", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: exercising the runtime guard against a bad input
    const result = await setBundeslandAction("XX" as any);

    expect(result).toEqual({ ok: false, error: "That's not a recognised German state." });
    expect(repos.households.save).not.toHaveBeenCalled();
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

describe("replaceClosureRangeAction (issue #171)", () => {
  const group = [
    { id: "a", date: "2026-08-03" },
    { id: "b", date: "2026-08-04" },
    { id: "c", date: "2026-08-05" },
  ];
  beforeEach(() => repos.closures.listByHousehold.mockResolvedValue(group));

  it("shrinking deletes the dropped days, rewrites the rest and notifies nobody", async () => {
    const result = await replaceClosureRangeAction({
      ids: ["a", "b", "c"],
      date: "2026-08-03",
      endDate: "2026-08-04",
      reason: " Summer ",
    });

    expect(result).toEqual({ ok: true, addedCount: 0 });
    expect(repos.closures.delete).toHaveBeenCalledTimes(1);
    expect(repos.closures.delete).toHaveBeenCalledWith("c");
    expect(savedDates()).toEqual(["2026-08-03", "2026-08-04"]);
    expect(repos.closures.save.mock.calls.map(([c]) => c.id)).toEqual(["a", "b"]);
    expect(dispatchAll).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("extending notifies only about the newly covered dates", async () => {
    await replaceClosureRangeAction({
      ids: ["a", "b", "c"],
      date: "2026-08-03",
      endDate: "2026-08-07",
      needsCover: true,
    });

    expect(repos.closures.delete).not.toHaveBeenCalled();
    expect(dispatched().map((n) => n.subjectLabel)).toEqual(["2026-08-06", "2026-08-07"]);
    expect(repos.closures.save.mock.calls.every(([c]) => c.needsCover === true)).toBe(true);
  });

  it("a kind change alone sends nothing", async () => {
    await replaceClosureRangeAction({
      ids: ["a", "b", "c"],
      date: "2026-08-03",
      endDate: "2026-08-05",
      needsCover: true,
    });

    expect(dispatchAll).not.toHaveBeenCalled();
  });

  it("rejects a foreign id without writing anything", async () => {
    const result = await replaceClosureRangeAction({
      ids: ["a", "someone-elses"],
      date: "2026-08-03",
      endDate: "2026-08-04",
    });

    expect(result.ok).toBe(false);
    expect(repos.closures.save).not.toHaveBeenCalled();
    expect(repos.closures.delete).not.toHaveBeenCalled();
  });

  it("rejects an end before the start", async () => {
    const result = await replaceClosureRangeAction({
      ids: ["a"],
      date: "2026-08-05",
      endDate: "2026-08-03",
    });

    expect(result.ok).toBe(false);
    expect(repos.closures.save).not.toHaveBeenCalled();
  });

  it("caps newly added days, not the group's total", async () => {
    const long = Array.from({ length: 40 }, (_, i) => ({
      id: `l${i}`,
      date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10),
    }));
    repos.closures.listByHousehold.mockResolvedValue(long);
    const ids = long.map((c) => c.id);

    const resave = await replaceClosureRangeAction({
      ids,
      date: long[0].date,
      endDate: long[39].date,
    });
    expect(resave.ok).toBe(true);

    const tooMany = await replaceClosureRangeAction({
      ids,
      date: long[0].date,
      endDate: "2026-10-30",
    });
    expect(tooMany.ok).toBe(false);
  });
});

describe("removeClosuresAction (issue #171)", () => {
  it("deletes every row of a range this household owns, in one transaction", async () => {
    repos.closures.listByHousehold.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "x" }]);

    await removeClosuresAction(["a", "b"]);

    expect(repos.closures.delete.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("deletes nothing when any id is foreign", async () => {
    repos.closures.listByHousehold.mockResolvedValue([{ id: "a" }]);

    await removeClosuresAction(["a", "someone-elses"]);

    expect(repos.closures.delete).not.toHaveBeenCalled();
  });
});
