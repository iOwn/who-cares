/**
 * The #52 domain services (`acceptRequest` / `declineRequest` / `cancelAbsence`
 * / `recordAbsence`) driven over real, migration-built repositories on
 * in-process PGlite (ADR-0006). The domain logic itself is unit-tested with
 * fakes in `src/domain/services/*.test.ts`; this tier pins the schema seams:
 *
 *   - an accept's `Assignment` insert coexists with `UNIQUE (household_id, date)`;
 *   - `pickup_requests.absence_id ON DELETE SET NULL` (migration `0006`) — a
 *     cancelled absence leaves its terminal request rows standing, so
 *     `UNIQUE (household_id, date)` keeps a re-declared absence from re-asking a
 *     day already Declined / Withdrawn ("never re-raised", CONTEXT.md).
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, type Repositories } from "@/db";
import {
  acceptRequest,
  cancelAbsence,
  declineRequest,
  noopAdapters,
  recordAbsence,
} from "@/domain";
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
  it("deletes the absence, leaves its request rows standing (absence_id nulled), touches no Assignment", async () => {
    // Accept one day first; its Assignment must survive the cancel untouched.
    await acceptRequest(deps(), { requestId: "r6", actingMemberId: MEMBER_2_ID });

    const result = await cancelAbsence(repos, {
      absenceId: "abs-1",
      actingMemberId: MEMBER_1_ID,
    });

    expect(await repos.absences.findById("abs-1")).toBeNull();

    // r7 (was Open) → Withdrawn, still present, absence link cleared by SET NULL.
    expect(await repos.pickupRequests.findById("r7")).toMatchObject({
      state: "Withdrawn",
      absenceId: null,
    });
    // r6 (was Accepted) → untouched state, still present, link cleared.
    expect(await repos.pickupRequests.findById("r6")).toMatchObject({
      state: "Accepted",
      absenceId: null,
    });
    // The accepted-request Assignment has no FK to the absence → it stands.
    expect(await repos.assignments.findByDate(HOUSEHOLD_ID, "2025-01-06")).toMatchObject({
      assigneeId: MEMBER_2_ID,
      source: "accepted-request",
    });
    expect(result.withdrawnRequests.map((r) => r.id)).toEqual(["r7"]);
    expect(result.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipientId: MEMBER_2_ID }),
        expect.objectContaining({ event: "assignment-stands", recipientId: MEMBER_2_ID }),
      ]),
    );
  });

  it("does NOT re-raise a Declined day after the absence is cancelled and re-declared", async () => {
    // A declares abs-1 (seeded) → B declines Tuesday 2025-01-07.
    await declineRequest(deps(), { requestId: "r7", actingMemberId: MEMBER_2_ID });
    expect(await repos.pickupRequests.findById("r7")).toMatchObject({ state: "Declined" });

    // A cancels the absence...
    await cancelAbsence(repos, { absenceId: "abs-1", actingMemberId: MEMBER_1_ID });
    // ...the Declined row is still there (SET NULL, not cascade).
    expect(await repos.pickupRequests.findById("r7")).toMatchObject({
      state: "Declined",
      absenceId: null,
    });

    // A re-declares an overlapping absence.
    const redeclared = await recordAbsence(deps(), {
      householdId: HOUSEHOLD_ID,
      memberId: MEMBER_1_ID,
      startDate: "2025-01-06",
      endDate: "2025-01-08",
    });

    // Tuesday is NOT re-asked — the terminal row (and UNIQUE(household_id,date)) block it.
    expect(redeclared.requests.map((r) => r.date)).not.toContain("2025-01-07");
    expect(redeclared.plan.find((p) => p.date === "2025-01-07")).toMatchObject({
      raise: false,
      skipReason: "request-exists",
    });
    // The day's only pickup_requests row is still the terminal Declined one.
    const tuesday = await repos.pickupRequests.findByDate(HOUSEHOLD_ID, "2025-01-07");
    expect(tuesday).toMatchObject({ id: "r7", state: "Declined" });
  });
});
