import { eq, sql } from "drizzle-orm";
import type { Member, MemberRepository } from "@/domain";
import type { DbExecutor } from "../client";
import { members } from "../schema";

/**
 * The slot a `save()` should write.
 *
 * `Member` carries no slot — it is a storage detail that exists to give
 * `Household.memberIds` a stable order (see `../schema`). So the value is
 * derived in SQL, in the same statement as the insert, to keep it atomic:
 *
 * - an existing member keeps the slot it already has, so a rename never
 *   reshuffles `memberIds`;
 * - a new member takes the lowest free slot of the two.
 *
 * When both slots are taken, the sub-select yields `NULL` and the `NOT NULL` on
 * `slot` rejects the write immediately — a third member fails at the statement,
 * not only at `COMMIT`.
 */
function slotExpression(id: string, householdId: string) {
  return sql<number>`coalesce(
    (select existing.slot from ${members} existing where existing.id = ${id}),
    (select candidate from generate_series(1, 2) as candidate
      where candidate not in (
        select taken.slot from ${members} taken where taken.household_id = ${householdId}
      )
      order by candidate
      limit 1)
  )`;
}

/** The PGlite/Drizzle-backed `MemberRepository` (ADR-0005 port). */
export function createMemberRepository(db: DbExecutor): MemberRepository {
  const columns = {
    id: members.id,
    householdId: members.householdId,
    name: members.name,
    email: members.email,
  };

  return {
    async findById(id: string): Promise<Member | null> {
      const [row] = await db.select(columns).from(members).where(eq(members.id, id)).limit(1);
      return row ?? null;
    },

    /** Ordered by slot, so the result lines up with `Household.memberIds`. */
    async listByHousehold(householdId: string): Promise<Member[]> {
      return db
        .select(columns)
        .from(members)
        .where(eq(members.householdId, householdId))
        .orderBy(members.slot);
    },

    async save(member: Member): Promise<void> {
      await db
        .insert(members)
        .values({
          id: member.id,
          householdId: member.householdId,
          slot: slotExpression(member.id, member.householdId),
          name: member.name,
          email: member.email,
        })
        .onConflictDoUpdate({
          target: members.id,
          set: {
            householdId: member.householdId,
            name: member.name,
            email: member.email,
          },
        });
    },
  };
}
