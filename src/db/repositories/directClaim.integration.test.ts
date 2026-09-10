/**
 * `claimDay` (#53) driven over real, migration-built repositories on in-process
 * PGlite (ADR-0006). The domain logic is unit-tested with fakes in
 * `src/domain/services/directClaim.test.ts`; this tier pins the schema seams a
 * fake can't:
 *
 *   - overwriting a day's assignment (delete-then-insert) stays inside
 *     `UNIQUE (household_id, date)` — the invariant the direct-claim override
 *     has to work with (ADR-0001);
 *   - the auto-withdrawn pickup request row persists (still `UNIQUE` on the
 *     day), so a declined/withdrawn day is never re-raised;
 *   - after the claim the day derives `Resolved` (`dayState`), even when the
 *     previous assignee had gone absent (an at-risk day the claim resolves).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, type Repositories } from "@/db";
import { claimDay, dayState, noopAdapters, recordAbsence } from "@/domain";
import {
  closeTestDatabase,
  createTestDatabase,
  HOUSEHOLD_ID,
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeAbsence,
  makeAssignment,
  makePickupRequest,
  makeTypicalHousehold,
  seed,
  truncateAll,
} from "@/testing";

const db = await createTestDatabase();
const repos: Repositories = createRepositories(db);

const deps = () => ({
  ...repos,
  clock: noopAdapters.fixedClock(new Date("2025-01-04T09:00:00.000Z")),
  ids: noopAdapters.systemIdGenerator,
});

afterAll(() => closeTestDatabase(db));

beforeEach(() => truncateAll(db));

describe("claimDay over real repositories", () => {
  it("overwrites an existing assignment for the day, staying within UNIQUE(household_id, date)", async () => {
    await seed(
      db,
      makeTypicalHousehold({
        assignments: [
          makeAssignment({
            id: "a-1",
            date: "2025-01-07",
            assigneeId: MEMBER_2_ID,
            source: "accepted-request",
          }),
        ],
      }),
    );

    const result = await claimDay(deps(), {
      householdId: HOUSEHOLD_ID,
      date: "2025-01-07",
      actingMemberId: MEMBER_1_ID,
    });

    expect(result.replacedAssignment).toMatchObject({ id: "a-1", assigneeId: MEMBER_2_ID });
    // The old row is gone; exactly one assignment remains for the day.
    const all = await repos.assignments.listByHousehold(HOUSEHOLD_ID);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ assigneeId: MEMBER_1_ID, source: "direct-claim" });
    expect(result.notifications).toEqual([
      expect.objectContaining({ event: "direct-claim", recipientId: MEMBER_2_ID }),
    ]);
  });

  it("auto-withdraws an open request on the day and leaves the row standing (never re-raised)", async () => {
    await seed(
      db,
      makeTypicalHousehold({
        absences: [
          makeAbsence({
            id: "abs-1",
            memberId: MEMBER_1_ID,
            startDate: "2025-01-07",
            endDate: "2025-01-07",
          }),
        ],
        pickupRequests: [
          makePickupRequest({
            id: "r-1",
            date: "2025-01-07",
            requesterId: MEMBER_1_ID,
            recipientId: MEMBER_2_ID,
            absenceId: "abs-1",
            state: "Open",
          }),
        ],
      }),
    );

    await claimDay(deps(), {
      householdId: HOUSEHOLD_ID,
      date: "2025-01-07",
      actingMemberId: MEMBER_2_ID,
    });

    expect(await repos.pickupRequests.findById("r-1")).toMatchObject({ state: "Withdrawn" });
    expect(await repos.assignments.findByDate(HOUSEHOLD_ID, "2025-01-07")).toMatchObject({
      assigneeId: MEMBER_2_ID,
      source: "direct-claim",
    });
  });

  it("resolves an at-risk day: the previous assignee had gone absent, the claim covers it", async () => {
    await seed(
      db,
      makeTypicalHousehold({
        // Bailey is assigned Tuesday, then records their own absence over it.
        assignments: [
          makeAssignment({
            id: "a-1",
            date: "2025-01-07",
            assigneeId: MEMBER_2_ID,
            source: "accepted-request",
          }),
        ],
      }),
    );
    await recordAbsence(deps(), {
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_2_ID,
      startDate: "2025-01-07",
      endDate: "2025-01-07",
    });

    const now = new Date("2025-01-06T09:00:00.000Z");
    const before = dayState(
      {
        date: "2025-01-07",
        isChildcareDay: true,
        assignment: await repos.assignments.findByDate(HOUSEHOLD_ID, "2025-01-07"),
        openRequest: null,
        absentMemberIds: [MEMBER_2_ID],
      },
      now,
    );
    expect(before.state).toBe("At-risk");

    await claimDay(deps(), {
      householdId: HOUSEHOLD_ID,
      date: "2025-01-07",
      actingMemberId: MEMBER_1_ID,
    });

    const after = dayState(
      {
        date: "2025-01-07",
        isChildcareDay: true,
        assignment: await repos.assignments.findByDate(HOUSEHOLD_ID, "2025-01-07"),
        openRequest: null,
        absentMemberIds: [MEMBER_2_ID],
      },
      now,
    );
    expect(after.state).toBe("Resolved");
  });
});
