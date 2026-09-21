import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { HIDE_WEEKENDS_COOKIE, parseHideWeekends } from "@/app/calendarPreferences";
import { auth, getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import { SectionHeading } from "@/ui";
import { NameCard } from "./NameCard";
import { PasskeyCard } from "./PasskeyCard";
import { type PushBrowserView, PushCard } from "./PushCard";
import styles from "./SettingsScreen.module.css";
import { type DeviceView, SignedInDevices } from "./SignedInDevices";
import { WeekendDaysCard } from "./WeekendDaysCard";

/**
 * `/settings` — the **personal** tab (issue #143): what belongs to the
 * signed-in member (their name — #153; passkey, sessions, push browsers —
 * issues #48, #90) or to this browser (the weekend-days preference, #130).
 * Nothing here is visible to the other parent. The shared childcare settings
 * live one tab over, at `./household/page.tsx`.
 *
 * A Server Component: it reads the session, the device list (`auth.api.*`
 * with the forwarded request headers, per Better Auth's session-management
 * docs) and the push subscriptions, then hands plain serialisable snapshots
 * to the client cards. It fetches only this tab's data — the household tab
 * pays for its own.
 *
 * "This device" is the token `getCurrentSession` already resolved — no second
 * `auth.api.getSession` round-trip (issue #144).
 */
export default async function SettingsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/");

  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const repos = createRepositories(db);
  const [sessions, pushSubscriptions] = await Promise.all([
    auth.api.listSessions({ headers: requestHeaders }),
    repos.pushSubscriptions.listByMember(current.member.id),
  ]);

  const pushBrowsers: PushBrowserView[] = pushSubscriptions
    .map((sub) => ({
      endpoint: sub.endpoint,
      userAgent: sub.userAgent ?? null,
      addedAt: (sub.createdAt ?? new Date()).toISOString(),
    }))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));

  const devices: DeviceView[] = sessions
    .map((session) => ({
      token: session.token,
      userAgent: session.userAgent ?? null,
      lastActiveAt: (session.updatedAt ?? session.createdAt).toISOString(),
      isCurrent: session.token === current.sessionToken,
    }))
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.lastActiveAt.localeCompare(a.lastActiveAt);
    });

  const hideWeekends = parseHideWeekends(cookieStore.get(HIDE_WEEKENDS_COOKIE)?.value);

  return (
    <>
      <section className={styles.section} aria-labelledby="settings-name-heading">
        <SectionHeading id="settings-name-heading">Your name</SectionHeading>
        <NameCard name={current.member.name} />
      </section>

      <section className={styles.section} aria-labelledby="settings-passkey-heading">
        <SectionHeading id="settings-passkey-heading">Sign in faster</SectionHeading>
        <PasskeyCard />
      </section>

      <section className={styles.section} aria-labelledby="settings-devices-heading">
        <SectionHeading id="settings-devices-heading">Signed-in devices</SectionHeading>
        <SignedInDevices devices={devices} />
      </section>

      <section className={styles.section} aria-labelledby="settings-push-heading">
        <SectionHeading id="settings-push-heading">Notifications</SectionHeading>
        <PushCard browsers={pushBrowsers} />
      </section>

      <section className={styles.section} aria-labelledby="settings-calendar-heading">
        <SectionHeading id="settings-calendar-heading">Calendar</SectionHeading>
        <WeekendDaysCard hideWeekends={hideWeekends} />
      </section>
    </>
  );
}
