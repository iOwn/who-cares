import { eq } from "drizzle-orm";
import type { Child, ChildRepository } from "@/domain";
import type { DbExecutor } from "../client";
import { children } from "../schema";

/**
 * The PGlite/Drizzle-backed `ChildRepository` (ADR-0005 port).
 *
 * `findByHousehold` returns at most one row without a `LIMIT` clause carrying
 * the invariant: `children.household_id` is `UNIQUE`, so "one per household" is
 * the schema's promise, not this adapter's.
 */
export function createChildRepository(db: DbExecutor): ChildRepository {
  const columns = {
    id: children.id,
    householdId: children.householdId,
    name: children.name,
  };

  return {
    async findById(id: string): Promise<Child | null> {
      const [row] = await db.select(columns).from(children).where(eq(children.id, id)).limit(1);
      return row ?? null;
    },

    async findByHousehold(householdId: string): Promise<Child | null> {
      const [row] = await db
        .select(columns)
        .from(children)
        .where(eq(children.householdId, householdId));
      return row ?? null;
    },

    async save(child: Child): Promise<void> {
      await db
        .insert(children)
        .values({
          id: child.id,
          householdId: child.householdId,
          name: child.name,
        })
        .onConflictDoUpdate({
          target: children.id,
          set: { householdId: child.householdId, name: child.name },
        });
    },
  };
}
