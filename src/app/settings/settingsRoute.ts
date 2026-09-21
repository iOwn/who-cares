/**
 * The two Settings tabs (issue #143) — which one a route segment means, and
 * what the shell shows for it.
 *
 * `/settings` is the member's own stuff (passkey, devices, push, this
 * browser's calendar preference); `/settings/household` is the shared stuff
 * (childcare pattern, closures) the other parent sees and gets notified
 * about. The shell in `SettingsShell.tsx` reads the active segment with
 * `useSelectedLayoutSegment()` and maps it through here; keeping the mapping
 * framework-free lets it unit-test in the `node` Vitest project
 * (`settingsRoute.test.ts`), like `backNavigation.ts`.
 */

export type SettingsTab = "you" | "household";

export interface SettingsTabInfo {
  readonly href: string;
  /** The `RouteHeader` title. */
  readonly title: string;
  /** The segment's label in the You / Household switch. */
  readonly label: string;
}

export const SETTINGS_TABS: Readonly<Record<SettingsTab, SettingsTabInfo>> = {
  you: { href: "/settings", title: "Your settings", label: "You" },
  household: { href: "/settings/household", title: "Household settings", label: "Household" },
};

/** Tab order in the switch. */
export const SETTINGS_TAB_ORDER: readonly SettingsTab[] = ["you", "household"];

/**
 * The tab for the segment below `src/app/settings/layout.tsx`: `null` is the
 * `/settings` page itself; anything unrecognised also lands on "you", the
 * route the gear opens.
 */
export function settingsTabForSegment(segment: string | null): SettingsTab {
  return segment === "household" ? "household" : "you";
}

/** The other tab — what to keep prefetched while this one is on screen. */
export function siblingSettingsTab(tab: SettingsTab): SettingsTab {
  return tab === "you" ? "household" : "you";
}

/** Parse a switch value back into a tab; anything unexpected stays put. */
export function settingsTabFromValue(value: string, current: SettingsTab): SettingsTab {
  return value === "you" || value === "household" ? value : current;
}
