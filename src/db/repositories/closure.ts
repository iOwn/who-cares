import { and, asc, eq } from "drizzle-orm";
import type { CalendarDate, Closure, ClosureRepository } from "@/domain";
import type { DbExecutor } from "../client";
import { closures } from "../schema";

/**
 * The PGlite/Drizzle-backed `ClosureRepository` (ADR-0005 port).
 *
 * `closures.reason` is nullable in the schema; the domain `Closure.reason` is an
 * optional property, so a `NULL` maps back to the key being absent rather than
 * `reason: null`. `findByDate` returns at most one row: `UNIQUE (household_id,
 * date)` is the schema's promise, not this adapter's.
 */
function toClosure(row: {
  id: string;
  householdId: string;
  date: string;
  reason: string | null;
}): Closure {
  return {
    id: row.id,
    householdId: row.householdId,
    date: row.date,
    ...(row.reason != null ? { reason: row.reason } : {}),
  };
}

export function createClosureRepository(db: DbExecutor): ClosureRepository {
  const columns = {
    id: closures.id,
    householdId: closures.householdId,
    date: closures.date,
    reason: closures.reason,
  };

  return {
    async listByHousehold(householdId: string): Promise<Closure[]> {
      const rows = await db
        .select(columns)
        .from(closures)
        .where(eq(closures.householdId, householdId))
        .orderBy(asc(closures.date));
      return rows.map(toClosure);
    },

    async findByDate(householdId: string, date: CalendarDate): Promise<Closure | null> {
      const [row] = await db
        .select(columns)
        .from(closures)
        .where(and(eq(closures.householdId, householdId), eq(closures.date, date)))
        .limit(1);
      return row ? toClosure(row) : null;
    },

    async save(closure: Closure): Promise<void> {
      await db
        .insert(closures)
        .values({
          id: closure.id,
          householdId: closure.householdId,
          date: closure.date,
          reason: closure.reason ?? null,
        })
        .onConflictDoUpdate({
          target: closures.id,
          set: {
            householdId: closure.householdId,
            date: closure.date,
            reason: closure.reason ?? null,
          },
        });
    },

    async delete(id: string): Promise<void> {
      await db.delete(closures).where(eq(closures.id, id));
    },
  };
}
