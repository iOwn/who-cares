/**
 * The #52 domain services (`acceptRequest` / `declineRequest` /
 * `cancelAbsence`) driven over real, migration-built repositories on in-process
 * PGlite (ADR-0006). The domain logic itself is unit-tested with fakes in
 * `src/domain/services/*.test.ts`; this tier only pins that the transitions
 * round-trip the schema and stay inside its cardinality guards — in particular
 * that an accept's `Assignment` insert coexists with
 * `UNIQUE (household_id, date)`.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, type Repositories } from "@/db";
import { acceptRequest, cancelAbsence, declineRequest, noopAdapters } from "@/domain";
import {
  closeTestDatabase,
  createTestDatabase,
  HOUSEHOLD_ID,
  MEMBER_1_ID,
  MEMBER_2_ID,
  makeAbsence,
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

beforeEach(async () => {
  await truncateAll(db);
  await seed(
    db,
    makeTypicalHousehold({
      absences: [
        makeAbsence({
          id: "abs-1",
          memberId: MEMBER_1_ID,
          startDate: "2025-01-06",
          endDate: "2025-01-07",
        }),
      ],
      pickupRequests: [
        makePickupRequest({
          id: "r6",
          date: "2025-01-06",
          requesterId: MEMBER_1_ID,
          recipientId: MEMBER_2_ID,
          absenceId: "abs-1",
          state: "Open",
        }),
        makePickupRequest({
          id: "r7",
          date: "2025-01-07",
          requesterId: MEMBER_1_ID,
          recipientId: MEMBER_2_ID,
          absenceId: "abs-1",
          state: "Open",
        }),
      ],
    }),
  );
});

describe("acceptRequest over real repositories", () => {
  it("writes an accepted-request Assignment and the day now has one assignee", async () => {
    const result = await acceptRequest(deps(), { requestId: "r6", actingMemberId: MEMBER_2_ID });

    expect(result.assignment).not.toBeNull();
    expect(await repos.pickupRequests.findById("r6")).toMatchObject({ state: "Accepted" });
    expect(await repos.assignments.findByDate(HOUSEHOLD_ID, "2025-01-06")).toMatchObject({
      assigneeId: MEMBER_2_ID,
      source: "accepted-request",
    });
    // The other day from the same absence is still Open — answered individually.
    expect(await repos.pickupRequests.findById("r7")).toMatchObject({ state: "Open" });
  });
});

describe("declineRequest over real repositories", () => {
  it("moves the request to terminal Declined with no Assignment", async () => {
    await declineRequest(deps(), { requestId: "r6", actingMemberId: MEMBER_2_ID });

    expect(await repos.pickupRequests.findById("r6")).toMatchObject({ state: "Declined" });
    expect(await repos.assignments.findByDate(HOUSEHOLD_ID, "2025-01-06")).toBeNull();
  });
});

describe("cancelAbsence over real repositories", () => {
  it("drops the absence + its request rows (FK cascade) but never touches an Assignment", async () => {
    // Accept one day first; its Assignment must survive the cancel untouched.
    await acceptRequest(deps(), { requestId: "r6", actingMemberId: MEMBER_2_ID });

    const result = await cancelAbsence(repos, {
      absenceId: "abs-1",
      actingMemberId: MEMBER_1_ID,
    });

    expect(await repos.absences.findById("abs-1")).toBeNull();
    // `pickup_requests.absence_id ON DELETE CASCADE` clears the absence's rows.
    expect(await repos.pickupRequests.findById("r7")).toBeNull();
    expect(await repos.pickupRequests.findById("r6")).toBeNull();
    // The accepted-request Assignment has no FK to the absence → it stands.
    expect(await repos.assignments.findByDate(HOUSEHOLD_ID, "2025-01-06")).toMatchObject({
      assigneeId: MEMBER_2_ID,
      source: "accepted-request",
    });
    // The withdrawn notice was still built for the parent who had r7 open.
    expect(result.withdrawnRequests.map((r) => r.id)).toEqual(["r7"]);
    expect(result.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipientId: MEMBER_2_ID }),
        expect.objectContaining({ event: "assignment-stands", recipientId: MEMBER_2_ID }),
      ]),
    );
  });
});
