import { eq } from "drizzle-orm";
import type { Household, HouseholdRepository } from "@/domain";
import type { DbExecutor } from "../client";
import { children, households, members } from "../schema";

/**
 * The PGlite/Drizzle-backed `HouseholdRepository` (ADR-0005 port, ADR-0006
 * adapter).
 *
 * ## What `save` does and does not own
 *
 * A `Household` is a *view* over three tables: its own row plus the member and
 * child rows that point back at it. `save()` therefore writes only the household
 * row (`id`, `name`); `memberIds` and `childId` are read-only projections and
 * are ignored on write. Membership is owned by `MemberRepository` and
 * `ChildRepository`, whose `household_id` FK is the real edge; the database —
 * not this adapter — guarantees it stays exactly two members and one child.
 *
 * Because that guarantee is a deferred constraint trigger, `save()` on a
 * *brand-new* household only succeeds inside a transaction that also inserts its
 * two members and its child. Updating an existing household's name is a plain
 * statement and needs no transaction.
 */
export function createHouseholdRepository(db: DbExecutor): HouseholdRepository {
  return {
    async findById(id: string): Promise<Household | null> {
      const [row] = await db.select().from(households).where(eq(households.id, id)).limit(1);
      if (!row) return null;

      const memberRows = await db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.householdId, id))
        .orderBy(members.slot);
      const [childRow] = await db
        .select({ id: children.id })
        .from(children)
        .where(eq(children.householdId, id))
        .limit(1);

      // Unreachable once the transaction that built the household has
      // committed; reachable while one is still open. Loud rather than a
      // silently malformed tuple.
      if (memberRows.length !== 2 || !childRow) {
        throw new Error(
          `household ${id} is incomplete: ${memberRows.length} member(s), ` +
            `${childRow ? 1 : 0} child`,
        );
      }

      return {
        id: row.id,
        name: row.name,
        memberIds: [memberRows[0].id, memberRows[1].id],
        childId: childRow.id,
      };
    },

    async save(household: Household): Promise<void> {
      await db
        .insert(households)
        .values({ id: household.id, name: household.name })
        .onConflictDoUpdate({
          target: households.id,
          set: { name: household.name },
        });
    },
  };
}
