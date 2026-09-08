/**
 * The repository adapters against a real, migration-built schema (ADR-0006).
 *
 * The seam under test is narrow on purpose: that these queries return the right
 * rows, mapped back to the domain shapes in `src/domain/types`. Behaviour built
 * *on top* of loaded entities is pure TypeScript and is tested without a
 * database at all.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, type Repositories, schema } from "@/db";
import type { ChildRepository, HouseholdRepository, MemberRepository } from "@/domain";
import {
  CHILD_ID,
  closeTestDatabase,
  createTestDatabase,
  HOUSEHOLD_ID,
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeChild,
  makeHousehold,
  makeMember,
  makeTypicalHousehold,
  seed,
  truncateAll,
} from "@/testing";

/** One fresh PGlite for this file (ADR-0006). */
const db = await createTestDatabase();
const repos: Repositories = createRepositories(db);

afterAll(async () => {
  await closeTestDatabase(db);
});

beforeEach(async () => {
  await truncateAll(db);
  await seed(db, makeTypicalHousehold());
});

/**
 * Drizzle wraps a driver error in a `DrizzleQueryError` whose own message is
 * only the failed SQL; the Postgres detail — the constraint that rejected the
 * write — is on `cause`. Assert against both so a test pins the actual reason.
 */
async function expectRejection(work: Promise<unknown>, reason: RegExp): Promise<void> {
  const error = await work.then(
    () => null,
    (thrown: unknown) => thrown as Error,
  );
  expect(error, "expected the query to be rejected").not.toBeNull();
  const detail = [error?.message, (error?.cause as Error | undefined)?.message].join("\n");
  expect(detail).toMatch(reason);
}

describe("createRepositories", () => {
  it("satisfies the domain ports", () => {
    // Compile-time assertions; the runtime check is that the factories return
    // something with the port's methods on it.
    const households: HouseholdRepository = repos.households;
    const members: MemberRepository = repos.members;
    const children: ChildRepository = repos.children;

    expect(Object.keys(households).sort()).toEqual(["findById", "save"]);
    expect(Object.keys(members).sort()).toEqual(["findById", "listByHousehold", "save"]);
    expect(Object.keys(children).sort()).toEqual(["findByHousehold", "findById", "save"]);
  });
});

describe("HouseholdRepository", () => {
  it("assembles the household from its three tables", async () => {
    expect(await repos.households.findById(HOUSEHOLD_ID)).toEqual({
      id: HOUSEHOLD_ID,
      name: "The Test Household",
      memberIds: [MEMBER_1_ID, MEMBER_2_ID],
      childId: CHILD_ID,
    });
  });

  it("returns null for an unknown id", async () => {
    expect(await repos.households.findById("no-such-household")).toBeNull();
  });

  it("orders memberIds by slot, not by id or insertion order", async () => {
    // Re-seed with the two members the other way round: `seed()` writes slot
    // from the tuple index, so `memberIds` must come back reversed too.
    const graph = makeTypicalHousehold();
    await truncateAll(db);
    await seed(db, { ...graph, members: [graph.members[1], graph.members[0]] });

    const household = await repos.households.findById(HOUSEHOLD_ID);
    expect(household?.memberIds).toEqual([MEMBER_2_ID, MEMBER_1_ID]);
  });

  it("updates the name of an existing household", async () => {
    await repos.households.save(makeHousehold({ name: "Renamed" }));

    expect((await repos.households.findById(HOUSEHOLD_ID))?.name).toBe("Renamed");
  });

  it("creates a whole household in one transaction", async () => {
    await db.transaction(async (tx) => {
      const txRepos = createRepositories(tx);
      await txRepos.households.save(
        makeHousehold({
          id: "household-2",
          name: "Second",
          memberIds: ["m3", "m4"],
          childId: "child-2",
        }),
      );
      await txRepos.members.save(
        makeMember({
          id: "m3",
          householdId: "household-2",
          name: "Casey",
          email: "casey@example.com",
        }),
      );
      await txRepos.members.save(
        makeMember({
          id: "m4",
          householdId: "household-2",
          name: "Devon",
          email: "devon@example.com",
        }),
      );
      await txRepos.children.save(
        makeChild({ id: "child-2", householdId: "household-2", name: "Robin" }),
      );
    });

    expect(await repos.households.findById("household-2")).toEqual({
      id: "household-2",
      name: "Second",
      memberIds: ["m3", "m4"],
      childId: "child-2",
    });
  });

  it("refuses to commit a household without its members and child", async () => {
    await expect(
      db.transaction(async (tx) => {
        await createRepositories(tx).households.save(makeHousehold({ id: "household-3" }));
      }),
    ).rejects.toThrow(/must have exactly two members, found 0/);

    expect(await repos.households.findById("household-3")).toBeNull();
  });
});

describe("MemberRepository", () => {
  it("finds a member by id, without leaking the storage-only slot", async () => {
    expect(await repos.members.findById(MEMBER_1_ID)).toEqual({
      id: MEMBER_1_ID,
      householdId: HOUSEHOLD_ID,
      name: "Alex",
      email: "alex@example.com",
    });
  });

  it("returns null for an unknown id", async () => {
    expect(await repos.members.findById("nobody")).toBeNull();
  });

  it("lists a household's members in slot order", async () => {
    const listed = await repos.members.listByHousehold(HOUSEHOLD_ID);
    expect(listed.map((member) => member.id)).toEqual([MEMBER_1_ID, MEMBER_2_ID]);
  });

  it("returns an empty list for a household with no members", async () => {
    expect(await repos.members.listByHousehold("no-such-household")).toEqual([]);
  });

  it("updates an existing member without moving their slot", async () => {
    await repos.members.save(
      makeMember({ id: MEMBER_2_ID, name: "Bailey Renamed", email: "bailey@example.com" }),
    );

    expect((await repos.members.findById(MEMBER_2_ID))?.name).toBe("Bailey Renamed");
    expect((await repos.households.findById(HOUSEHOLD_ID))?.memberIds).toEqual([
      MEMBER_1_ID,
      MEMBER_2_ID,
    ]);
  });

  it("gives a replacement member the slot that was freed", async () => {
    await db.transaction(async (tx) => {
      await tx.delete(schema.members).where(eq(schema.members.id, MEMBER_1_ID));
      await createRepositories(tx).members.save(
        makeMember({ id: "m3", name: "Casey", email: "casey@example.com" }),
      );
    });

    const [slot] = (
      await db.$client.query<{ slot: number }>(`SELECT slot FROM members WHERE id = 'm3'`)
    ).rows;
    expect(slot).toEqual({ slot: 1 });
    expect((await repos.households.findById(HOUSEHOLD_ID))?.memberIds).toEqual(["m3", MEMBER_2_ID]);
  });

  it("rejects a third member outright, not only at COMMIT", async () => {
    // Both slots are taken, so the slot sub-select yields NULL and `NOT NULL`
    // rejects the statement immediately.
    await expectRejection(
      repos.members.save(makeMember({ id: "m3", name: "Casey", email: "casey@example.com" })),
      /null value in column "slot"/,
    );
  });
});

describe("ChildRepository", () => {
  it("finds the child by id", async () => {
    expect(await repos.children.findById(CHILD_ID)).toEqual({
      id: CHILD_ID,
      householdId: HOUSEHOLD_ID,
      name: "Sam",
    });
  });

  it("finds the child by household", async () => {
    expect(await repos.children.findByHousehold(HOUSEHOLD_ID)).toEqual({
      id: CHILD_ID,
      householdId: HOUSEHOLD_ID,
      name: "Sam",
    });
  });

  it("returns null when there is no such child or household", async () => {
    expect(await repos.children.findById("child-99")).toBeNull();
    expect(await repos.children.findByHousehold("no-such-household")).toBeNull();
  });

  it("updates the child's name", async () => {
    await repos.children.save(makeChild({ name: "Sam Renamed" }));

    expect((await repos.children.findByHousehold(HOUSEHOLD_ID))?.name).toBe("Sam Renamed");
  });

  it("rejects a second child for the same household", async () => {
    await expectRejection(
      repos.children.save(makeChild({ id: "child-2", name: "Robin" })),
      /children_household_unique/,
    );
  });
});
