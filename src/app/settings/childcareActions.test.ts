/**
 * The childcare-settings Server Actions are thin adapters (ADR-0005) and are not
 * unit-tested for their domain behaviour — that lives in `childcareDay.ts` /
 * `notifier.ts`. This file guards one cross-cutting contract only: **every
 * mutating action drains the coalescing queue at its top** (ADR-0012,
 * `docs/notifications.md`, issue #92), unconditionally — so a household that
 * only edits or removes closures still delivers its own due notification.
 *
 * The wiring (`db`, auth, repositories, the notification services) is `vi.mock`ed
 * — a `"use server"` module cannot take injection.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOUSEHOLD_ID, MEMBER_1_ID, MEMBER_2_ID, makeHousehold, makeMember } from "@/testing";

const flush = vi.fn(async () => 0);
const notify = vi.fn(async () => {});
const dispatchAll = vi.fn(async () => {});

const repos = {
  childcarePattern: {
    findByHousehold: vi.fn(async (): Promise<{ versions: unknown[] } | null> => null),
    save: vi.fn(async () => {}),
  },
  closures: {
    findByDate: vi.fn(async (): Promise<{ id: string; householdId: string } | null> => null),
    listByHousehold: vi.fn(async (): Promise<{ id: string }[]> => []),
    save: vi.fn(async () => {}),
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
  notificationServicesFor: () => ({ flush, notifier: { notify }, dispatchAll }),
}));

const { removeClosureAction, saveClosureAction, savePatternAction } = await import(
  "./childcareActions"
);

beforeEach(() => {
  flush.mockClear();
  notify.mockClear();
  repos.childcarePattern.findByHousehold.mockResolvedValue(null);
  repos.closures.findByDate.mockResolvedValue(null);
  repos.closures.listByHousehold.mockResolvedValue([]);
});

describe("every mutating childcare-settings action flushes the coalescing queue first (issue #92)", () => {
  it("savePatternAction flushes", async () => {
    await savePatternAction({ weekdays: ["mon"], effectiveFrom: "2025-01-06" });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("saveClosureAction flushes", async () => {
    await saveClosureAction({ date: "2025-01-06" });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("removeClosureAction flushes even though it never enqueues anything", async () => {
    repos.closures.listByHousehold.mockResolvedValue([{ id: "c1" }]);
    await removeClosureAction("c1");
    expect(flush).toHaveBeenCalledTimes(1);
    expect(repos.closures.delete).toHaveBeenCalledWith("c1");
  });

  it("removeClosureAction flushes before bailing on a foreign closure id", async () => {
    repos.closures.listByHousehold.mockResolvedValue([{ id: "mine" }]);
    await removeClosureAction("someone-elses");
    expect(flush).toHaveBeenCalledTimes(1);
    expect(repos.closures.delete).not.toHaveBeenCalled();
  });

  it("saveClosureAction on an unchanged existing closure still flushes (no enqueue path)", async () => {
    repos.closures.findByDate.mockResolvedValue({ id: "c1", householdId: HOUSEHOLD_ID });
    repos.closures.listByHousehold.mockResolvedValue([{ id: "c1" }]);
    notify.mockClear();
    await saveClosureAction({ id: "c1", date: "2025-01-06" });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });
});
