import { eq } from "drizzle-orm";
import type { AtRiskEscalationRecord, AtRiskEscalationRepository, CalendarDate } from "@/domain";
import type { DbExecutor } from "../client";
import { atRiskEscalations } from "../schema";

/**
 * The PGlite/Drizzle-backed `AtRiskEscalationRepository` (ADR-0005 port, issue
 * #55) — the "we already told both parents about this at-risk day" ledger.
 *
 * Day state itself is never stored (ADR-0003); this records only that the
 * once-daily backstop notification went out, so the next cron tick skips the
 * `(date, event)`. `claimNotified` inserts on `(household_id, date, event)` and
 * reports whether the row was newly its own — a re-run for a pair already in the
 * ledger claims nothing (so its notifications are dropped), but a *different*
 * event for the same date (escalated → both-absent) still lands.
 */
export function createAtRiskEscalationRepository(db: DbExecutor): AtRiskEscalationRepository {
  return {
    async listNotified(householdId: string): Promise<AtRiskEscalationRecord[]> {
      const rows = await db
        .select({ date: atRiskEscalations.date, event: atRiskEscalations.event })
        .from(atRiskEscalations)
        .where(eq(atRiskEscalations.householdId, householdId));
      return rows.map((row) => ({ date: row.date, event: row.event }));
    },

    async claimNotified(
      householdId: string,
      date: CalendarDate,
      event: string,
      at: Date,
    ): Promise<boolean> {
      const inserted = await db
        .insert(atRiskEscalations)
        .values({ householdId, date, event, notifiedAt: at })
        .onConflictDoNothing({
          target: [atRiskEscalations.householdId, atRiskEscalations.date, atRiskEscalations.event],
        })
        .returning({ date: atRiskEscalations.date });
      return inserted.length > 0;
    },
  };
}
