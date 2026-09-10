import { eq } from "drizzle-orm";
import type { AtRiskEscalationRepository, CalendarDate } from "@/domain";
import type { DbExecutor } from "../client";
import { atRiskEscalations } from "../schema";

/**
 * The PGlite/Drizzle-backed `AtRiskEscalationRepository` (ADR-0005 port, issue
 * #55) — the "we already told both parents this day is at-risk" ledger.
 *
 * Day state itself is never stored (ADR-0003); this records only that the
 * once-daily backstop notification went out, so the next cron tick skips the
 * day. `record` upserts on `(household_id, date)` — a re-run for a day already
 * in the ledger is a harmless no-op.
 */
export function createAtRiskEscalationRepository(db: DbExecutor): AtRiskEscalationRepository {
  return {
    async listNotifiedDates(householdId: string): Promise<CalendarDate[]> {
      const rows = await db
        .select({ date: atRiskEscalations.date })
        .from(atRiskEscalations)
        .where(eq(atRiskEscalations.householdId, householdId));
      return rows.map((row) => row.date);
    },

    async record(householdId: string, date: CalendarDate, event: string, at: Date): Promise<void> {
      await db
        .insert(atRiskEscalations)
        .values({ householdId, date, event, notifiedAt: at })
        .onConflictDoNothing({
          target: [atRiskEscalations.householdId, atRiskEscalations.date],
        });
    },
  };
}
