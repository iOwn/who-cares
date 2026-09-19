/**
 * The once-daily at-risk escalation backstop (issue #55, ADR-0004).
 *
 * Vercel Cron hits this on the schedule in `vercel.json`. Day state is already
 * computed live at read time (ADR-0003), so this route changes nothing a parent
 * sees — it only sends the notification for a day that has newly become at-risk
 * (catalogue events 9 + 10), which ADR-0004 explicitly allows to lag by up to a
 * day.
 *
 * A thin adapter over `runAtRiskEscalation` (ADR-0005): verify the caller,
 * loop the households, dispatch what the domain service returns.
 *
 * `dispatchAll` runs **once per household**, so a tick that finds ten newly
 * at-risk days sends each parent one bundled mail listing them, not ten
 * (issue #131, ADR-0018).
 */

import { db } from "@/auth/config";
import { schema } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { noopAdapters, runAtRiskEscalation } from "@/domain";
import { createNotificationServices, getCronSecret } from "@/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const secret = getCronSecret();
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const repos = createRepositories(db);
  const services = createNotificationServices(repos);

  const households = await db.select({ id: schema.households.id }).from(schema.households);

  let notified = 0;
  const failed: string[] = [];

  for (const household of households) {
    try {
      const { notifications } = await runAtRiskEscalation(
        { ...repos, clock: noopAdapters.systemClock },
        { householdId: household.id },
      );
      await services.dispatchAll(notifications);
      notified += notifications.length;
    } catch (error) {
      console.error(`at-risk escalation failed for household ${household.id}`, error);
      failed.push(household.id);
    }
  }

  return Response.json({
    ok: failed.length === 0,
    households: households.length,
    notified,
    ...(failed.length > 0 ? { failed } : {}),
  });
}
