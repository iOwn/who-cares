/**
 * `POST` / `DELETE /api/push/subscribe` (issue #90) — the enrollment adapter.
 *
 * A thin seam over `PushSubscriptionRepository` (ADR-0005), the mirror of what
 * `webPushSender` reads: the settings card subscribes a browser via the Push
 * API and `POST`s the resulting `PushSubscription` here; toggling push off (or
 * `pushManager.unsubscribe()`) `DELETE`s it. `webPushSender` drops rows that
 * come back `404`/`410` on its own, so this route only handles the deliberate
 * opt in / opt out.
 *
 * Both verbs require a signed-in session and scope every write to
 * `getCurrentSession().member` — an endpoint that isn't this member's is left
 * untouched.
 */

import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";

export const dynamic = "force-dynamic";

interface SubscribeBody {
  subscription?: {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
}

export async function POST(request: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sub = body.subscription;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : null;
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : null;
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : null;
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: "malformed subscription" }, { status: 400 });
  }

  const repos = createRepositories(db);
  // `save` upserts on `endpoint`, so a browser re-subscribing (or a member
  // switching accounts on a shared browser) refreshes the row rather than
  // duplicating or stranding it under the old owner.
  await repos.pushSubscriptions.save({
    id: crypto.randomUUID(),
    memberId: session.member.id,
    endpoint,
    p256dh,
    auth,
    userAgent: request.headers.get("user-agent"),
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  let endpoint: string | null = null;
  try {
    const body = (await request.json()) as { endpoint?: unknown };
    if (typeof body.endpoint === "string") endpoint = body.endpoint;
  } catch {
    // fall through to the 400 below
  }
  if (!endpoint) return Response.json({ error: "endpoint required" }, { status: 400 });

  const repos = createRepositories(db);
  const owned = await repos.pushSubscriptions.listByMember(session.member.id);
  if (owned.some((row) => row.endpoint === endpoint)) {
    await repos.pushSubscriptions.deleteByEndpoint(endpoint);
  }

  return Response.json({ ok: true });
}
