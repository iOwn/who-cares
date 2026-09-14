/**
 * Vercel Protection Bypass for Automation (issue #99).
 *
 * The preview deployment sits behind Vercel Authentication (Deployment
 * Protection), which 401s any request that isn't an authenticated Vercel SSO
 * session — including Playwright's direct `POST /api/test/{seed,login}` calls
 * and every page navigation in the browser context. Vercel's documented
 * escape hatch is a per-project secret (`VERCEL_AUTOMATION_BYPASS_SECRET`)
 * sent as the `x-vercel-protection-bypass` header; pairing it with
 * `x-vercel-set-bypass-cookie: true` makes Vercel set a bypass cookie on the
 * response so the browser's *own* subsequent requests (images, client-side
 * navigation, etc.) clear the wall too, not just the request that carried
 * the header.
 *
 * This is a no-op — both call sites get `{}` — when the secret isn't set, so
 * local dev (`pnpm e2e` against a non-protected personal deploy) and any run
 * where the operator hasn't provisioned the secret yet are unaffected.
 */
export function vercelBypassHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return {};

  return {
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true",
  };
}
