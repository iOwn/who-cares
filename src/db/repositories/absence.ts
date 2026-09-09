import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { Absence, AbsenceRepository, CalendarDate } from "@/domain";
import type { DbExecutor } from "../client";
import { absences } from "../schema";

/**
 * The PGlite/Drizzle-backed `AbsenceRepository` (ADR-0005 port).
 *
 * `label` / `note` are nullable columns but optional domain properties, so a
 * `NULL` maps back to the key being absent rather than `label: null` — the same
 * convention `ClosureRepository` follows for `reason`. `listCovering` is the
 * hot path for request generation and live day-state: absences whose inclusive
 * `start_date`–`end_date` range spans a given date.
 */
function toAbsence(row: {
  id: string;
  householdId: string;
  memberId: string;
  startDate: string;
  endDate: string;
  label: string | null;
  note: string | null;
}): Absence {
  return {
    id: row.id,
    householdId: row.householdId,
    memberId: row.memberId,
    startDate: row.startDate,
    endDate: row.endDate,
    ...(row.label != null ? { label: row.label } : {}),
    ...(row.note != null ? { note: row.note } : {}),
  };
}

export function createAbsenceRepository(db: DbExecutor): AbsenceRepository {
  const columns = {
    id: absences.id,
    householdId: absences.householdId,
    memberId: absences.memberId,
    startDate: absences.startDate,
    endDate: absences.endDate,
    label: absences.label,
    note: absences.note,
  };

  return {
    async findById(id: string): Promise<Absence | null> {
      const [row] = await db.select(columns).from(absences).where(eq(absences.id, id)).limit(1);
      return row ? toAbsence(row) : null;
    },

    async listByHousehold(householdId: string): Promise<Absence[]> {
      const rows = await db
        .select(columns)
        .from(absences)
        .where(eq(absences.householdId, householdId))
        .orderBy(asc(absences.startDate));
      return rows.map(toAbsence);
    },

    async listCovering(householdId: string, date: CalendarDate): Promise<Absence[]> {
      const rows = await db
        .select(columns)
        .from(absences)
        .where(
          and(
            eq(absences.householdId, householdId),
            lte(absences.startDate, date),
            gte(absences.endDate, date),
          ),
        )
        .orderBy(asc(absences.startDate));
      return rows.map(toAbsence);
    },

    async save(absence: Absence): Promise<void> {
      const values = {
        id: absence.id,
        householdId: absence.householdId,
        memberId: absence.memberId,
        startDate: absence.startDate,
        endDate: absence.endDate,
        label: absence.label ?? null,
        note: absence.note ?? null,
      };
      await db
        .insert(absences)
        .values(values)
        .onConflictDoUpdate({ target: absences.id, set: values });
    },

    async delete(id: string): Promise<void> {
      await db.delete(absences).where(eq(absences.id, id));
    },
  };
}
