import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import { AppShell } from "./AppShell";
import { SignInScreen } from "./SignInScreen";

/** `'YYYY-MM-DD'` for the server's current instant (UTC). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function Home() {
  const current = await getCurrentSession();
  if (!current) {
    return <SignInScreen />;
  }

  const repos = createRepositories(db);
  const [pattern, closures] = await Promise.all([
    repos.childcarePattern.findByHousehold(current.household.id),
    repos.closures.listByHousehold(current.household.id),
  ]);

  return (
    <AppShell
      childName={current.child?.name ?? ""}
      pattern={pattern}
      closures={closures}
      initialToday={todayIso()}
    />
  );
}
