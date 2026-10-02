/**
 * Third-party cover (#183, ADR-0023) over real, migration-built repositories on
 * PGlite (ADR-0006): the label round-trips, the day derives `Resolved`, and the
 * `assignments_third_party_has_no_assignee` check rejects a third-party row that
 * names a member. Domain logic is unit-tested in `thirdPartyCover.test.ts`.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, type Repositories } from "@/db";
import { arrangeThirdPartyCover, dayState, noopAdapters } from "@/domain";
import {
  closeTestDatabase,
  createTestDatabase,
  HOUSEHOLD_ID,
  MEMBER_1_ID,
  makeAssignment,
  makeTypicalHousehold,
  seed,
  truncateAll,
} from "@/testing";

const db = await createTestDatabase();
const repos: Repositories = createRepositories(db);
const NOW = new Date("2025-01-04T09:00:00.000Z");

afterAll(() => closeTestDatabase(db));
beforeEach(() => truncateAll(db));

describe("third-party cover over real repositories", () => {
  it("persists the label, replaces the day's row, and derives Resolved", async () => {
    await seed(
      db,
      makeTypicalHousehold({
        assignments: [makeAssignment({ id: "a-1", date: "2025-01-07", assigneeId: MEMBER_1_ID })],
      }),
    );

    await arrangeThirdPartyCover(
      { ...repos, clock: noopAdapters.fixedClock(NOW), ids: noopAdapters.systemIdGenerator },
      { householdId: HOUSEHOLD_ID, date: "2025-01-07", actingMemberId: MEMBER_1_ID, label: "Gran" },
    );

    const all = await repos.assignments.listByHousehold(HOUSEHOLD_ID);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      assigneeId: null,
      source: "third-party",
      thirdPartyLabel: "Gran",
    });
    const result = dayState(
      {
        date: "2025-01-07",
        isChildcareDay: true,
        assignment: all[0] ?? null,
        openRequest: null,
        absentMemberIds: [],
      },
      NOW,
    );
    expect(result.state).toBe("Resolved");
  });

  it("the DB rejects a third-party assignment that names a member", async () => {
    await seed(db, makeTypicalHousehold());
    await expect(
      repos.assignments.save(
        makeAssignment({ date: "2025-01-07", assigneeId: MEMBER_1_ID, source: "third-party" }),
      ),
    ).rejects.toThrow();
  });
});
