import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, getCurrentSession } from "@/auth";
import { SettingsScreen } from "./SettingsScreen";
import type { DeviceView } from "./SignedInDevices";

/**
 * Settings route (issue #48) — currently just the two auth-hygiene sections
 * (enroll a passkey, manage signed-in devices). Issue #49 is expected to add
 * childcare-pattern / closures sections to this same route in parallel; those
 * land as sibling sections composed into `SettingsScreen`, so the merge is
 * mechanical.
 *
 * A Server Component: it reads the session and the device list on the server
 * (`auth.api.*` with the forwarded request headers, per Better Auth's session-
 * management docs) and hands a plain serialisable snapshot to the client
 * `SettingsScreen`. Mutations happen client-side via `authClient` +
 * `router.refresh()`.
 */
export default async function SettingsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/");

  const requestHeaders = await headers();
  const [sessions, active] = await Promise.all([
    auth.api.listSessions({ headers: requestHeaders }),
    auth.api.getSession({ headers: requestHeaders }),
  ]);

  const currentToken = active?.session.token ?? null;

  const devices: DeviceView[] = sessions
    .map((session) => ({
      token: session.token,
      userAgent: session.userAgent ?? null,
      lastActiveAt: (session.updatedAt ?? session.createdAt).toISOString(),
      isCurrent: session.token === currentToken,
    }))
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.lastActiveAt.localeCompare(a.lastActiveAt);
    });

  return <SettingsScreen childName={current.child?.name ?? ""} devices={devices} />;
}
