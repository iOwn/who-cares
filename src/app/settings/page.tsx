import { redirect } from "next/navigation";
import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import { ChildcareSettings } from "./ChildcareSettings";

/**
 * The settings route. As of #49 it carries the childcare-pattern + closures
 * form only; the parallel #48 work adds the passkey / devices section. Keep any
 * additions in their own files so the merge stays mechanical.
 */
export default async function SettingsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/");

  const repos = createRepositories(db);
  const [pattern, closures] = await Promise.all([
    repos.childcarePattern.findByHousehold(current.household.id),
    repos.closures.listByHousehold(current.household.id),
  ]);

  return (
    <ChildcareSettings
      pattern={pattern}
      closures={closures}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
