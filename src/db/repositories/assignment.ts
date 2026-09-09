import { and, asc, eq } from "drizzle-orm";
import type { Assignment, AssignmentRepository, CalendarDate } from "@/domain";
import type { DbExecutor } from "../client";
import { assignments } from "../schema";

/**
 * The PGlite/Drizzle-backed `AssignmentRepository` (ADR-0005 port).
 *
 * `assignee_id` is nullable — `null` is "nobody" (CONTEXT.md), a real value the
 * domain carries, so it maps straight through rather than collapsing to an
 * absent key. `UNIQUE (household_id, date)` is the "at most one per date"
 * invariant; `save` upserts on the primary key, so replacing a day's assignment
 * (a direct claim, #53) is the caller's job to sequence, not this adapter's.
 */
function toAssignment(row: {
  id: string;
  householdId: string;
  date: string;
  assigneeId: string | null;
  source: string;
  createdAt: Date;
}): Assignment {
  return {
    id: row.id,
    householdId: row.householdId,
    date: row.date,
    assigneeId: row.assigneeId,
    source: row.source as Assignment["source"],
    createdAt: row.createdAt,
  };
}

export function createAssignmentRepository(db: DbExecutor): AssignmentRepository {
  const columns = {
    id: assignments.id,
    householdId: assignments.householdId,
    date: assignments.date,
    assigneeId: assignments.assigneeId,
    source: assignments.source,
    createdAt: assignments.createdAt,
  };

  return {
    async findByDate(householdId: string, date: CalendarDate): Promise<Assignment | null> {
      const [row] = await db
        .select(columns)
        .from(assignments)
        .where(and(eq(assignments.householdId, householdId), eq(assignments.date, date)))
        .limit(1);
      return row ? toAssignment(row) : null;
    },

    async listByHousehold(householdId: string): Promise<Assignment[]> {
      const rows = await db
        .select(columns)
        .from(assignments)
        .where(eq(assignments.householdId, householdId))
        .orderBy(asc(assignments.date));
      return rows.map(toAssignment);
    },

    async save(assignment: Assignment): Promise<void> {
      const values = {
        id: assignment.id,
        householdId: assignment.householdId,
        date: assignment.date,
        assigneeId: assignment.assigneeId,
        source: assignment.source,
        createdAt: assignment.createdAt,
      };
      await db
        .insert(assignments)
        .values(values)
        .onConflictDoUpdate({ target: assignments.id, set: values });
    },

    async delete(id: string): Promise<void> {
      await db.delete(assignments).where(eq(assignments.id, id));
    },
  };
}
