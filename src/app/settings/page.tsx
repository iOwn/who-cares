import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import { SettingsScreen } from "./SettingsScreen";
import type { DeviceView } from "./SignedInDevices";

/**
 * Settings route. Composes the two auth-hygiene sections (issue #48 — enroll a
 * passkey, manage signed-in devices) with the childcare-pattern / closures
 * sections (issue #49) into one `SettingsScreen`.
 *
 * A Server Component: it reads the session, the device list (`auth.api.*` with
 * the forwarded request headers, per Better Auth's session-management docs) and
 * the childcare pattern + closures on the server, then hands a plain
 * serialisable snapshot to the client `SettingsScreen`. Mutations happen
 * client-side (`authClient` + `router.refresh()`) or via the childcare Server
 * Actions.
 */
export default async function SettingsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/");

  const requestHeaders = await headers();
  const repos = createRepositories(db);
  const [sessions, active, pattern, closures] = await Promise.all([
    auth.api.listSessions({ headers: requestHeaders }),
    auth.api.getSession({ headers: requestHeaders }),
    repos.childcarePattern.findByHousehold(current.household.id),
    repos.closures.listByHousehold(current.household.id),
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

  return (
    <SettingsScreen
      childName={current.child?.name ?? ""}
      devices={devices}
      pattern={pattern}
      closures={closures}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
