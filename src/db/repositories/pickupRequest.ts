import { and, asc, desc, eq } from "drizzle-orm";
import type { CalendarDate, PickupRequest, PickupRequestRepository } from "@/domain";
import type { DbExecutor } from "../client";
import { pickupRequests } from "../schema";

/**
 * The PGlite/Drizzle-backed `PickupRequestRepository` (ADR-0005 port).
 *
 * `state` is stored as its domain string (`Open` / `Accepted` / `Declined` /
 * `Withdrawn`), guarded by a CHECK constraint in the schema. `raised_at` is a
 * real `timestamptz` — both ADR-0003 48h clocks run from it — and Drizzle maps
 * it back to a `Date`. `findByDate` leans on `UNIQUE (household_id, date)` (a
 * request is never re-raised), but still orders by `raised_at` desc so a
 * hand-seeded duplicate resolves to the newest.
 *
 * `absence_id` is nullable (`ON DELETE SET NULL`, migration `0006`): a terminal
 * request outlives the absence that raised it, so the "never re-raised"
 * `UNIQUE (household_id, date)` guard survives a `cancelAbsence`.
 */
function toPickupRequest(row: {
  id: string;
  householdId: string;
  date: string;
  requesterId: string;
  recipientId: string;
  absenceId: string | null;
  state: string;
  raisedAt: Date;
}): PickupRequest {
  return {
    id: row.id,
    householdId: row.householdId,
    date: row.date,
    requesterId: row.requesterId,
    recipientId: row.recipientId,
    absenceId: row.absenceId,
    state: row.state as PickupRequest["state"],
    raisedAt: row.raisedAt,
  };
}

export function createPickupRequestRepository(db: DbExecutor): PickupRequestRepository {
  const columns = {
    id: pickupRequests.id,
    householdId: pickupRequests.householdId,
    date: pickupRequests.date,
    requesterId: pickupRequests.requesterId,
    recipientId: pickupRequests.recipientId,
    absenceId: pickupRequests.absenceId,
    state: pickupRequests.state,
    raisedAt: pickupRequests.raisedAt,
  };

  return {
    async findById(id: string): Promise<PickupRequest | null> {
      const [row] = await db
        .select(columns)
        .from(pickupRequests)
        .where(eq(pickupRequests.id, id))
        .limit(1);
      return row ? toPickupRequest(row) : null;
    },

    async findByDate(householdId: string, date: CalendarDate): Promise<PickupRequest | null> {
      const [row] = await db
        .select(columns)
        .from(pickupRequests)
        .where(and(eq(pickupRequests.householdId, householdId), eq(pickupRequests.date, date)))
        .orderBy(desc(pickupRequests.raisedAt))
        .limit(1);
      return row ? toPickupRequest(row) : null;
    },

    async listByHousehold(householdId: string): Promise<PickupRequest[]> {
      const rows = await db
        .select(columns)
        .from(pickupRequests)
        .where(eq(pickupRequests.householdId, householdId))
        .orderBy(asc(pickupRequests.date));
      return rows.map(toPickupRequest);
    },

    async save(request: PickupRequest): Promise<void> {
      const values = {
        id: request.id,
        householdId: request.householdId,
        date: request.date,
        requesterId: request.requesterId,
        recipientId: request.recipientId,
        absenceId: request.absenceId,
        state: request.state,
        raisedAt: request.raisedAt,
      };
      await db
        .insert(pickupRequests)
        .values(values)
        .onConflictDoUpdate({ target: pickupRequests.id, set: values });
    },
  };
}
