import type { ReactNode } from "react";
import { SettingsShell } from "./SettingsShell";

/**
 * The Settings segment layout (issue #143): one shell, two pages —
 * `./page.tsx` (the member's own settings) and `./household/page.tsx` (the
 * shared ones). Everything the shell needs is in `SettingsShell`; this file
 * MUST stay free of `headers()` / `cookies()` / session reads, or Next stops
 * showing `./loading.tsx` on navigation (see the note in `SettingsShell`).
 * Each page checks the session for itself.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
