import { getCurrentSession } from "@/auth";
import { AppShell } from "./AppShell";
import { SignInScreen } from "./SignInScreen";

export default async function Home() {
  const current = await getCurrentSession();
  if (!current) {
    return <SignInScreen />;
  }

  return <AppShell childName={current.child?.name ?? ""} />;
}
