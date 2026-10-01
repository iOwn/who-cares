import { redirect } from "next/navigation";
import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import { publicHolidayClosures, publicHolidayWindow } from "@/domain";
import { BundeslandCard } from "../BundeslandCard";
import { ChildcareSettings } from "../ChildcareSettings";
import styles from "../SettingsScreen.module.css";

/**
 * `/settings/household` — the **shared** tab (issue #143): the childcare
 * pattern and closures (issue #49), plus the Bundesland setting and its
 * derived public holidays (issue #167, ADR-0020). Everything here changes
 * the other parent's calendar too, and they are notified when it does
 * (ADR-0018) — the lead line says so, in the child's name, since the title
 * can't (see `../SettingsShell.tsx` for why the titles are static).
 *
 * Fetches only this tab's data: pattern, (manual) closures, and the members —
 * the latter just to name the other parent. The personal tab pays for its
 * own. `closures` here is deliberately `listByHousehold`'s raw result, never
 * merged with derived holidays (`page.tsx`'s calendar does that) — `holidays`
 * is a separate, explicitly read-only list `ChildcareSettings` renders below
 * the editable one.
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

  const today = new Date().toISOString().slice(0, 10);
  const bundesland = current.household.bundesland ?? null;
  const holidays = bundesland
    ? publicHolidayClosures({
        householdId: current.household.id,
        state: bundesland,
        pattern,
        ...publicHolidayWindow(today),
      })
    : [];

  const otherParent = members.find((m) => m.id !== current.member.id);
  const childName = current.child?.name ?? "";

  return (
    <>
      <p className={styles.lead}>
        {childName ? `${childName}’s childcare` : "The childcare pattern and closures"}, shared with{" "}
        {otherParent?.name ?? "the other parent"} — they’ll be notified when you change something
        here.
      </p>

      <BundeslandCard bundesland={bundesland} />

      <ChildcareSettings pattern={pattern} closures={closures} holidays={holidays} today={today} />
    </>
  );
}
