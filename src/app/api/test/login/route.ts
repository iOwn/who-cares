/**
 * `POST /api/test/login` — mint a Better Auth session for a named test member
 * (issue #56, ADR-0008). Body: `{ "member": "a" | "b" }` (slot 1 / slot 2 of
 * `ALLOWED_MEMBER_EMAILS`).
 *
 * Mounted only when `E2E_TEST_MODE` is set — `assertTestModeEnabled()` returns a
 * bare 404 otherwise. The magic-link *email* path is not smoke-covered
 * (ADR-0008); this stands in for it by driving the exact same server code the
 * real magic-link verify runs: it plants a short-lived verification token, then
 * calls `auth.api.magicLinkVerify`, which creates the Better Auth user on first
 * use (firing `databaseHooks.user.create.after` → the idempotent
 * `bootstrapHousehold`, which just finds the already-seeded members), creates
 * the session row, and signs the `__Host-whocares.session` cookie. Those
 * `Set-Cookie` headers are relayed verbatim to the caller (Playwright's request
 * context), which persists them via `storageState`.
 */

import { headers } from "next/headers";
import { auth } from "@/auth";
import { getAllowlistedEmails } from "@/auth/env";
import { e2eMemberEmail } from "@/testing/e2eHousehold";
import { assertTestModeEnabled, TestModeDisabledError } from "../testMode";

export const dynamic = "force-dynamic";

function randomToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertTestModeEnabled();
  } catch (error) {
    if (error instanceof TestModeDisabledError) return new Response(null, { status: 404 });
    throw error;
  }

  let member: unknown;
  try {
    member = ((await request.json()) as { member?: unknown }).member;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (member !== "a" && member !== "b") {
    return Response.json({ error: "member must be 'a' or 'b'" }, { status: 400 });
  }

  const email = e2eMemberEmail(getAllowlistedEmails(), member);

  const context = await auth.$context;
  const token = randomToken();
  await context.internalAdapter.createVerificationValue({
    identifier: token,
    value: JSON.stringify({ email }),
    expiresAt: new Date(Date.now() + 2 * 60_000),
  });

  let verifyResponse: Response;
  try {
    verifyResponse = await auth.api.magicLinkVerify({
      query: { token },
      headers: await headers(),
      asResponse: true,
    });
  } catch (error) {
    console.error("POST /api/test/login: magicLinkVerify threw", error);
    return Response.json({ error: "login failed" }, { status: 500 });
  }

  const setCookies = verifyResponse.headers.getSetCookie();
  if (!verifyResponse.ok || setCookies.length === 0) {
    console.error(
      "POST /api/test/login: magicLinkVerify did not set a session cookie",
      verifyResponse.status,
    );
    return Response.json({ error: "login failed" }, { status: 500 });
  }

  const out = Response.json({ ok: true, member, email });
  for (const cookie of setCookies) out.headers.append("set-cookie", cookie);
  return out;
}
