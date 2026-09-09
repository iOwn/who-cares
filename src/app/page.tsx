import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import { AppShell } from "./AppShell";
import { SignInScreen } from "./SignInScreen";

export default async function Home() {
  const current = await getCurrentSession();
  if (!current) {
    return <SignInScreen />;
  }

  const repos = createRepositories(db);
  const [pattern, closures, members] = await Promise.all([
    repos.childcarePattern.findByHousehold(current.household.id),
    repos.closures.listByHousehold(current.household.id),
    repos.members.listByHousehold(current.household.id),
  ]);

  // One server instant, formatted two ways — the calendar corrects both to the
  // viewer's clock after mount.
  const serverNow = new Date();

  return (
    <AppShell
      childName={current.child?.name ?? ""}
      pattern={pattern}
      closures={closures}
      members={members}
      initialToday={serverNow.toISOString().slice(0, 10)}
      initialNow={serverNow.toISOString()}
    />
  );
}
