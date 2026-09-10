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
 * loop the households, dispatch what the domain service returns, flush the
 * coalescing queue while we're here.
 */

import { db } from "@/auth/config";
import { schema } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { runAtRiskEscalation } from "@/domain";
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
  let flushed = await services.flush();

  for (const household of households) {
    const { notifications } = await runAtRiskEscalation(
      { ...repos, clock: { now: () => new Date() } },
      { householdId: household.id },
    );
    await services.dispatchAll(notifications);
    notified += notifications.length;
  }

  // A second flush: an escalation dispatch above is immediate, but a settings
  // edit's queued row might have come due between the first flush and now.
  flushed += await services.flush();

  return Response.json({ ok: true, households: households.length, notified, flushed });
}
