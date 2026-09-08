/**
 * `seed()` against the real migration schema: the rows it writes, and the FK /
 * cardinality constraints that guard them.
 *
 * These assertions read rows back with raw SQL rather than through a
 * repository — the repositories have their own file, and the point here is what
 * is *in the database*.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  CHILD_ID,
  closeTestDatabase,
  createTestDatabase,
  HOUSEHOLD_ID,
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeTypicalHousehold,
  seed,
  truncateAll,
} from "@/testing";

/** One fresh PGlite for this file (ADR-0006). */
const db = await createTestDatabase();
const pg = db.$client;

afterAll(async () => {
  await closeTestDatabase(db);
});

beforeEach(async () => {
  await truncateAll(db);
});

describe("seed", () => {
  it("writes the household, both members and the child", async () => {
    const report = await seed(db, makeTypicalHousehold());

    expect(report.inserted).toEqual({ households: 1, members: 2, children: 1 });

    const households = await pg.query<{ id: string; name: string }>(
      `SELECT id, name FROM households`,
    );
    expect(households.rows).toEqual([{ id: HOUSEHOLD_ID, name: "The Test Household" }]);

    const members = await pg.query<{
      id: string;
      household_id: string;
      slot: number;
      name: string;
      email: string;
    }>(`SELECT id, household_id, slot, name, email FROM members ORDER BY slot`);
    expect(members.rows).toEqual([
      {
        id: MEMBER_1_ID,
        household_id: HOUSEHOLD_ID,
        slot: 1,
        name: "Alex",
        email: "alex@example.com",
      },
      {
        id: MEMBER_2_ID,
        household_id: HOUSEHOLD_ID,
        slot: 2,
        name: "Bailey",
        email: "bailey@example.com",
      },
    ]);

    const children = await pg.query<{ id: string; household_id: string; name: string }>(
      `SELECT id, household_id, name FROM children`,
    );
    expect(children.rows).toEqual([{ id: CHILD_ID, household_id: HOUSEHOLD_ID, name: "Sam" }]);
  });

  it("seeds through raw INSERTs, so a `created_at` default comes from the schema", async () => {
    await seed(db, makeTypicalHousehold());

    const result = await pg.query<{ created_at: Date }>(`SELECT created_at FROM households`);
    expect(result.rows[0].created_at).toBeInstanceOf(Date);
  });

  it("reports the entity kinds this schema cannot store yet", async () => {
    const report = await seed(db, makeTypicalHousehold());

    // Pinned so the list cannot go stale: each migration that adds one of these
    // tables must extend `seed()` and shorten this expectation.
    expect(report.skipped).toEqual(["pattern"]);
  });

  it("rolls the whole graph back when any row is rejected", async () => {
    const graph = makeTypicalHousehold();
    const clashing = {
      ...graph,
      members: [graph.members[0], { ...graph.members[1], email: graph.members[0].email }] as const,
    };

    await expect(seed(db, clashing)).rejects.toThrow(/members_email_unique/);

    const households = await pg.query(`SELECT id FROM households`);
    expect(households.rows).toEqual([]);
  });
});

describe("the household FK graph", () => {
  beforeEach(async () => {
    await seed(db, makeTypicalHousehold());
  });

  it("rejects a member pointing at a household that does not exist", async () => {
    await expect(
      pg.query(
        `INSERT INTO members (id, household_id, slot, name, email) VALUES ($1,$2,$3,$4,$5)`,
        ["m3", "no-such-household", 1, "Casey", "casey@example.com"],
      ),
    ).rejects.toThrow(/members_household_id_households_id_fk/);
  });

  it("rejects a child pointing at a household that does not exist", async () => {
    await expect(
      pg.query(`INSERT INTO children (id, household_id, name) VALUES ($1,$2,$3)`, [
        "child-2",
        "no-such-household",
        "Robin",
      ]),
    ).rejects.toThrow(/children_household_id_households_id_fk/);
  });

  it("rejects a third member: only slots 1 and 2 exist", async () => {
    await expect(
      pg.query(
        `INSERT INTO members (id, household_id, slot, name, email) VALUES ($1,$2,$3,$4,$5)`,
        ["m3", HOUSEHOLD_ID, 3, "Casey", "casey@example.com"],
      ),
    ).rejects.toThrow(/members_slot_range/);
  });

  it("rejects a second member in an occupied slot", async () => {
    await expect(
      pg.query(
        `INSERT INTO members (id, household_id, slot, name, email) VALUES ($1,$2,$3,$4,$5)`,
        ["m3", HOUSEHOLD_ID, 1, "Casey", "casey@example.com"],
      ),
    ).rejects.toThrow(/members_household_slot_unique/);
  });

  it("rejects a second child for the same household", async () => {
    await expect(
      pg.query(`INSERT INTO children (id, household_id, name) VALUES ($1,$2,$3)`, [
        "child-2",
        HOUSEHOLD_ID,
        "Robin",
      ]),
    ).rejects.toThrow(/children_household_unique/);
  });

  it("rejects a household left with one member at COMMIT", async () => {
    await expect(
      pg.transaction(async (tx) => {
        await tx.query(`DELETE FROM members WHERE id = $1`, [MEMBER_2_ID]);
      }),
    ).rejects.toThrow(/must have exactly two members, found 1/);

    const remaining = await pg.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM members`,
    );
    expect(remaining.rows[0].count).toBe(2);
  });

  it("rejects a household left with no child at COMMIT", async () => {
    await expect(
      pg.transaction(async (tx) => {
        await tx.query(`DELETE FROM children WHERE id = $1`, [CHILD_ID]);
      }),
    ).rejects.toThrow(/must have exactly one child, found 0/);
  });

  it("rejects a bare household insert with no members or child", async () => {
    await expect(
      pg.query(`INSERT INTO households (id, name) VALUES ($1, $2)`, ["household-2", "Lonely"]),
    ).rejects.toThrow(/must have exactly two members, found 0/);
  });

  it("cascades a household delete to its members and child", async () => {
    await pg.query(`DELETE FROM households WHERE id = $1`, [HOUSEHOLD_ID]);

    const counts = await pg.query<{ members: number; children: number }>(
      `SELECT (SELECT count(*) FROM members)::int AS members,
              (SELECT count(*) FROM children)::int AS children`,
    );
    expect(counts.rows[0]).toEqual({ members: 0, children: 0 });
  });
});
