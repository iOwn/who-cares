import { asc, eq } from "drizzle-orm";
import type { ChildcarePattern, ChildcarePatternRepository, Weekday } from "@/domain";
import type { DbExecutor } from "../client";
import { childcarePatternVersions } from "../schema";

/**
 * The PGlite/Drizzle-backed `ChildcarePatternRepository` (ADR-0005 port).
 *
 * The pattern has no table of its own — it *is* its ordered version list, keyed
 * by household (`../schema`). So `findByHousehold` assembles a `ChildcarePattern`
 * whose `id` is the `householdId` from the `childcare_pattern_versions` rows,
 * ordered by `effective_from`; `save` replaces the whole set (delete-then-insert)
 * because a pattern is only ever read and written whole.
 *
 * `save` enforces the domain's strictly-ascending-`effectiveFrom` rule (ADR-0002)
 * before touching the database — the schema's `UNIQUE (household_id,
 * effective_from)` only catches exact duplicates. Callers that need the
 * delete+insert to be atomic pass a transaction executor.
 */
export function createChildcarePatternRepository(db: DbExecutor): ChildcarePatternRepository {
  return {
    async findByHousehold(householdId: string): Promise<ChildcarePattern | null> {
      const rows = await db
        .select({
          weekdays: childcarePatternVersions.weekdays,
          effectiveFrom: childcarePatternVersions.effectiveFrom,
        })
        .from(childcarePatternVersions)
        .where(eq(childcarePatternVersions.householdId, householdId))
        .orderBy(asc(childcarePatternVersions.effectiveFrom));

      if (rows.length === 0) return null;

      return {
        id: householdId,
        householdId,
        versions: rows.map((row) => ({
          weekdays: row.weekdays as Weekday[],
          effectiveFrom: row.effectiveFrom,
        })),
      };
    },

    async save(pattern: ChildcarePattern): Promise<void> {
      for (let i = 1; i < pattern.versions.length; i += 1) {
        if (pattern.versions[i].effectiveFrom <= pattern.versions[i - 1].effectiveFrom) {
          throw new Error(
            "childcare pattern versions must have strictly-ascending effectiveFrom; " +
              `${pattern.versions[i].effectiveFrom} does not come after ` +
              `${pattern.versions[i - 1].effectiveFrom}`,
          );
        }
      }

      await db
        .delete(childcarePatternVersions)
        .where(eq(childcarePatternVersions.householdId, pattern.householdId));

      if (pattern.versions.length === 0) return;

      await db.insert(childcarePatternVersions).values(
        pattern.versions.map((version) => ({
          id: `${pattern.householdId}:${version.effectiveFrom}`,
          householdId: pattern.householdId,
          weekdays: [...version.weekdays],
          effectiveFrom: version.effectiveFrom,
        })),
      );
    },
  };
}
