/**
 * `renameMemberAction` (issue #153) is a thin adapter (ADR-0005); the name rule
 * itself is tested in `memberName.test.ts`. This file guards the action's own
 * contracts: it writes the *actor's* row and nothing else, it saves the
 * normalised name, invalid input comes back as a result rather than a throw,
 * and a rejected name writes nothing.
 *
 * The wiring (`db`, auth, repositories) is `vi.mock`ed — a `"use server"`
 * module cannot take injection.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_MEMBER_NAME_LENGTH, type Member } from "@/domain";
import { HOUSEHOLD_ID, MEMBER_1_ID, makeHousehold, makeMember } from "@/testing";

const actor = makeMember({ id: MEMBER_1_ID, name: "Alex", email: "alex@example.com" });

const repos = {
  members: {
    save: vi.fn(async (_member: Member) => {}),
  },
};

const revalidatePath = vi.fn();
const getCurrentSession = vi.fn(async () => ({
  member: actor,
  household: makeHousehold({ id: HOUSEHOLD_ID }),
}));

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/auth", () => ({ getCurrentSession: () => getCurrentSession() }));
vi.mock("@/auth/config", () => ({ db: {} }));
vi.mock("@/db/repositories", () => ({ createRepositories: () => repos }));

const { renameMemberAction } = await import("./memberActions");

beforeEach(() => {
  repos.members.save.mockClear();
  revalidatePath.mockClear();
  getCurrentSession.mockResolvedValue({
    member: actor,
    household: makeHousehold({ id: HOUSEHOLD_ID }),
  });
});

describe("renameMemberAction", () => {
  it("saves the normalised name on the actor's own row, keeping id / household / email", async () => {
    const result = await renameMemberAction("  Alex   Parker ");

    expect(result).toEqual({ ok: true, name: "Alex Parker" });
    expect(repos.members.save).toHaveBeenCalledTimes(1);
    expect(repos.members.save).toHaveBeenCalledWith({
      id: MEMBER_1_ID,
      householdId: actor.householdId,
      email: "alex@example.com",
      name: "Alex Parker",
    });
  });

  it("revalidates the settings segment and the calendar", async () => {
    await renameMemberAction("Alex");

    expect(revalidatePath).toHaveBeenCalledWith("/settings", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("answers an empty name with a result, not a throw, and writes nothing", async () => {
    const result = await renameMemberAction("   ");

    expect(result).toMatchObject({ ok: false });
    expect(repos.members.save).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an over-length name without writing", async () => {
    const result = await renameMemberAction("a".repeat(MAX_MEMBER_NAME_LENGTH + 1));

    expect(result).toMatchObject({ ok: false });
    expect(repos.members.save).not.toHaveBeenCalled();
  });

  it("throws when there is no session (a bug or an expired session, not user input)", async () => {
    getCurrentSession.mockResolvedValueOnce(null as never);

    await expect(renameMemberAction("Alex")).rejects.toThrow("Not signed in");
    expect(repos.members.save).not.toHaveBeenCalled();
  });
});
