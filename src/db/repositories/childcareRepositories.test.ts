/**
 * `ChildcarePatternRepository` + `ClosureRepository` against a real,
 * migration-built schema (ADR-0006, issue #49).
 *
 * The seam under test is narrow: that these queries round-trip the domain
 * shapes in `src/domain/types` — the effective-dated pattern (ADR-0002) as its
 * ordered version list, and single-date closures with an optional reason.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, type Repositories } from "@/db";
import { isChildcareDay } from "@/domain";
import {
  closeTestDatabase,
  createTestDatabase,
  HOUSEHOLD_ID,
  makeClosure,
  makeTypicalHousehold,
  pattern,
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

describe("ChildcarePatternRepository", () => {
  it("loads the seeded single-version pattern, id = householdId", async () => {
    expect(await repos.childcarePattern.findByHousehold(HOUSEHOLD_ID)).toEqual({
      id: HOUSEHOLD_ID,
      householdId: HOUSEHOLD_ID,
      versions: [{ weekdays: ["mon", "tue", "wed", "thu", "fri"], effectiveFrom: "2025-01-06" }],
    });
  });

  it("returns null for a household with no pattern", async () => {
    expect(await repos.childcarePattern.findByHousehold("no-such-household")).toBeNull();
  });

  it("replaces the whole version set on save, ordered by effectiveFrom", async () => {
    await repos.childcarePattern.save(
      pattern.versions([
        { weekdays: ["mon", "tue", "wed"], effectiveFrom: "2025-01-06" },
        { weekdays: ["mon", "tue", "wed", "thu", "fri"], effectiveFrom: "2025-09-01" },
      ]),
    );

    const loaded = await repos.childcarePattern.findByHousehold(HOUSEHOLD_ID);
    expect(loaded?.versions).toEqual([
      { weekdays: ["mon", "tue", "wed"], effectiveFrom: "2025-01-06" },
      { weekdays: ["mon", "tue", "wed", "thu", "fri"], effectiveFrom: "2025-09-01" },
    ]);
  });

  it("round-trips through the derivation service", async () => {
    await repos.childcarePattern.save(
      pattern.versions([
        { weekdays: ["mon", "tue"], effectiveFrom: "2025-01-06" },
        { weekdays: ["mon", "tue", "wed", "thu", "fri"], effectiveFrom: "2025-06-02" },
      ]),
    );
    const loaded = await repos.childcarePattern.findByHousehold(HOUSEHOLD_ID);

    expect(isChildcareDay(loaded, [], "2025-01-08")).toBe(false); // Wed, old version
    expect(isChildcareDay(loaded, [], "2025-06-04")).toBe(true); // Wed, new version
  });

  it("rejects a save with non-ascending effectiveFrom", async () => {
    await expect(
      repos.childcarePattern.save({
        id: HOUSEHOLD_ID,
        householdId: HOUSEHOLD_ID,
        versions: [
          { weekdays: ["mon"], effectiveFrom: "2025-06-01" },
          { weekdays: ["tue"], effectiveFrom: "2025-01-01" },
        ],
      }),
    ).rejects.toThrow(/strictly-ascending/);
  });
});

describe("ClosureRepository", () => {
  it("saves and lists closures ordered by date, reason optional", async () => {
    await repos.closures.save(makeClosure({ id: "c1", date: "2025-02-10", reason: "Staff day" }));
    await repos.closures.save(makeClosure({ id: "c2", date: "2025-01-20" }));

    expect(await repos.closures.listByHousehold(HOUSEHOLD_ID)).toEqual([
      { id: "c2", householdId: HOUSEHOLD_ID, date: "2025-01-20" },
      { id: "c1", householdId: HOUSEHOLD_ID, date: "2025-02-10", reason: "Staff day" },
    ]);
  });

  it("finds a closure by date and returns null when there is none", async () => {
    await repos.closures.save(makeClosure({ id: "c1", date: "2025-02-10", reason: "Closed" }));

    expect(await repos.closures.findByDate(HOUSEHOLD_ID, "2025-02-10")).toEqual({
      id: "c1",
      householdId: HOUSEHOLD_ID,
      date: "2025-02-10",
      reason: "Closed",
    });
    expect(await repos.closures.findByDate(HOUSEHOLD_ID, "2025-02-11")).toBeNull();
  });

  it("updates an existing closure's reason and date on save", async () => {
    await repos.closures.save(makeClosure({ id: "c1", date: "2025-02-10", reason: "Guess" }));
    await repos.closures.save(makeClosure({ id: "c1", date: "2025-02-11", reason: "Corrected" }));

    expect(await repos.closures.listByHousehold(HOUSEHOLD_ID)).toEqual([
      { id: "c1", householdId: HOUSEHOLD_ID, date: "2025-02-11", reason: "Corrected" },
    ]);
  });

  it("removes a closure", async () => {
    await repos.closures.save(makeClosure({ id: "c1", date: "2025-02-10" }));
    await repos.closures.delete("c1");
    expect(await repos.closures.listByHousehold(HOUSEHOLD_ID)).toEqual([]);
  });

  it("rejects a second closure on the same date", async () => {
    await repos.closures.save(makeClosure({ id: "c1", date: "2025-02-10" }));

    // Drizzle wraps the driver error; the constraint name is on `cause`.
    const error = await repos.closures.save(makeClosure({ id: "c2", date: "2025-02-10" })).then(
      () => null,
      (thrown: unknown) => thrown as Error,
    );
    const detail = [error?.message, (error?.cause as Error | undefined)?.message].join("\n");
    expect(detail).toMatch(/closures_household_date_unique/);
  });
});
