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
 * `(date, event)`. `record` upserts on `(household_id, date, event)` — a re-run
 * for a pair already in the ledger is a harmless no-op, but a *different* event
 * for the same date (escalated → both-absent) still lands.
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

    async record(householdId: string, date: CalendarDate, event: string, at: Date): Promise<void> {
      await db
        .insert(atRiskEscalations)
        .values({ householdId, date, event, notifiedAt: at })
        .onConflictDoNothing({
          target: [atRiskEscalations.householdId, atRiskEscalations.date, atRiskEscalations.event],
        });
    },
  };
}
