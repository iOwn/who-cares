/**
 * `AbsenceRepository` + `PickupRequestRepository` + `AssignmentRepository`
 * against a real, migration-built schema (ADR-0006, issue #51).
 *
 * The seam under test is narrow: that these queries round-trip the domain
 * shapes in `src/domain/types` and that the schema's cardinality guards
 * (one assignment per date, one request per date) hold.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, type Repositories } from "@/db";
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

afterAll(async () => {
  await closeTestDatabase(db);
});

beforeEach(async () => {
  await truncateAll(db);
  await seed(db, makeTypicalHousehold());
});

describe("AbsenceRepository", () => {
  it("saves and reads back an absence, label and note optional", async () => {
    await repos.absences.save(
      makeAbsence({
        id: "a1",
        memberId: MEMBER_1_ID,
        startDate: "2025-01-06",
        endDate: "2025-01-08",
        label: "Conference",
      }),
    );

    expect(await repos.absences.findById("a1")).toEqual({
      id: "a1",
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_1_ID,
      startDate: "2025-01-06",
      endDate: "2025-01-08",
      label: "Conference",
    });
  });

  it("lists absences that cover a given date", async () => {
    await repos.absences.save(
      makeAbsence({ id: "a1", startDate: "2025-01-06", endDate: "2025-01-10" }),
    );
    await repos.absences.save(
      makeAbsence({ id: "a2", startDate: "2025-01-20", endDate: "2025-01-20" }),
    );

    expect(
      (await repos.absences.listCovering(HOUSEHOLD_ID, "2025-01-08")).map((a) => a.id),
    ).toEqual(["a1"]);
    expect(await repos.absences.listCovering(HOUSEHOLD_ID, "2025-01-15")).toEqual([]);
  });

  it("updates and deletes an absence", async () => {
    await repos.absences.save(
      makeAbsence({ id: "a1", startDate: "2025-01-06", endDate: "2025-01-06" }),
    );
    await repos.absences.save(
      makeAbsence({ id: "a1", startDate: "2025-01-06", endDate: "2025-01-09", note: "extended" }),
    );
    expect((await repos.absences.findById("a1"))?.endDate).toBe("2025-01-09");

    await repos.absences.delete("a1");
    expect(await repos.absences.findById("a1")).toBeNull();
  });
});

describe("PickupRequestRepository", () => {
  beforeEach(async () => {
    await repos.absences.save(
      makeAbsence({ id: "abs-1", startDate: "2025-01-06", endDate: "2025-01-08" }),
    );
  });

  it("round-trips a request including its raisedAt instant and state", async () => {
    const raisedAt = new Date("2025-01-05T08:30:00.000Z");
    await repos.pickupRequests.save(
      makePickupRequest({
        id: "r1",
        date: "2025-01-06",
        requesterId: MEMBER_1_ID,
        recipientId: MEMBER_2_ID,
        absenceId: "abs-1",
        state: "Open",
        raisedAt,
      }),
    );

    const loaded = await repos.pickupRequests.findByDate(HOUSEHOLD_ID, "2025-01-06");
    expect(loaded).toMatchObject({
      id: "r1",
      date: "2025-01-06",
      requesterId: MEMBER_1_ID,
      recipientId: MEMBER_2_ID,
      absenceId: "abs-1",
      state: "Open",
    });
    expect(loaded?.raisedAt.toISOString()).toBe("2025-01-05T08:30:00.000Z");
  });

  it("updates a request's state on save", async () => {
    await repos.pickupRequests.save(
      makePickupRequest({ id: "r1", date: "2025-01-06", absenceId: "abs-1", state: "Open" }),
    );
    await repos.pickupRequests.save(
      makePickupRequest({ id: "r1", date: "2025-01-06", absenceId: "abs-1", state: "Accepted" }),
    );
    expect((await repos.pickupRequests.findById("r1"))?.state).toBe("Accepted");
  });

  it("rejects a second request on the same date", async () => {
    await repos.pickupRequests.save(
      makePickupRequest({ id: "r1", date: "2025-01-06", absenceId: "abs-1" }),
    );
    const error = await repos.pickupRequests
      .save(makePickupRequest({ id: "r2", date: "2025-01-06", absenceId: "abs-1" }))
      .then(
        () => null,
        (thrown: unknown) => thrown as Error,
      );
    const detail = [error?.message, (error?.cause as Error | undefined)?.message].join("\n");
    expect(detail).toMatch(/pickup_requests_household_date_unique/);
  });

  it("rejects an unknown state via the CHECK constraint", async () => {
    const error = await repos.pickupRequests
      .save(
        makePickupRequest({
          id: "r1",
          date: "2025-01-06",
          absenceId: "abs-1",
          state: "Bogus" as never,
        }),
      )
      .then(
        () => null,
        (thrown: unknown) => thrown as Error,
      );
    const detail = [error?.message, (error?.cause as Error | undefined)?.message].join("\n");
    expect(detail).toMatch(/pickup_requests_state_valid/);
  });
});

describe("AssignmentRepository", () => {
  it("stores a nobody assignment as a null assignee", async () => {
    await repos.assignments.save(
      makeAssignment({ id: "asg-1", date: "2025-01-06", assigneeId: null, source: "direct-claim" }),
    );
    expect(await repos.assignments.findByDate(HOUSEHOLD_ID, "2025-01-06")).toMatchObject({
      assigneeId: null,
      source: "direct-claim",
    });
  });

  it("rejects a second assignment on the same date", async () => {
    await repos.assignments.save(makeAssignment({ id: "asg-1", date: "2025-01-06" }));
    const error = await repos.assignments
      .save(makeAssignment({ id: "asg-2", date: "2025-01-06" }))
      .then(
        () => null,
        (thrown: unknown) => thrown as Error,
      );
    const detail = [error?.message, (error?.cause as Error | undefined)?.message].join("\n");
    expect(detail).toMatch(/assignments_household_date_unique/);
  });

  it("lists and deletes assignments", async () => {
    await repos.assignments.save(makeAssignment({ id: "asg-1", date: "2025-01-06" }));
    await repos.assignments.save(makeAssignment({ id: "asg-2", date: "2025-01-07" }));
    expect((await repos.assignments.listByHousehold(HOUSEHOLD_ID)).map((a) => a.date)).toEqual([
      "2025-01-06",
      "2025-01-07",
    ]);
    await repos.assignments.delete("asg-1");
    expect((await repos.assignments.listByHousehold(HOUSEHOLD_ID)).map((a) => a.date)).toEqual([
      "2025-01-07",
    ]);
  });
});
