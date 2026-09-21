import { redirect } from "next/navigation";
import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import { ChildcareSettings } from "../ChildcareSettings";
import styles from "../SettingsScreen.module.css";

/**
 * `/settings/household` — the **shared** tab (issue #143): the childcare
 * pattern and closures (issue #49). Everything here changes the other
 * parent's calendar too, and they are notified when it does (ADR-0018) — the
 * lead line says so, in the child's name, since the title can't (see
 * `../SettingsShell.tsx` for why the titles are static).
 *
 * Fetches only this tab's data: pattern, closures, and the members — the
 * latter just to name the other parent. The personal tab pays for its own.
 */
export default async function HouseholdSettingsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/");

  const repos = createRepositories(db);
  const [pattern, closures, members] = await Promise.all([
    repos.childcarePattern.findByHousehold(current.household.id),
    repos.closures.listByHousehold(current.household.id),
    repos.members.listByHousehold(current.household.id),
  ]);

  const otherParent = members.find((m) => m.id !== current.member.id);
  const childName = current.child?.name ?? "";

  return (
    <>
      <p className={styles.lead}>
        {childName ? `${childName}’s childcare` : "The childcare pattern and closures"}, shared with{" "}
        {otherParent?.name ?? "the other parent"} — they’ll be notified when you change something
        here.
      </p>

      <ChildcareSettings
        pattern={pattern}
        closures={closures}
        today={new Date().toISOString().slice(0, 10)}
      />
    </>
  );
}
