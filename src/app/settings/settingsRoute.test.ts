import { describe, expect, it } from "vitest";
import {
  SETTINGS_TAB_ORDER,
  SETTINGS_TABS,
  settingsTabForSegment,
  settingsTabFromValue,
  siblingSettingsTab,
} from "./settingsRoute";

describe("Settings tabs (issue #143)", () => {
  it("maps the layout's child segment to a tab, defaulting to the personal one", () => {
    expect(settingsTabForSegment(null)).toBe("you");
    expect(settingsTabForSegment("household")).toBe("household");
    // An unknown segment (a future sibling, a typo'd deep link) is not a crash.
    expect(settingsTabForSegment("whatever")).toBe("you");
  });

  it("keeps the gear's target as the personal tab's href", () => {
    expect(SETTINGS_TABS.you.href).toBe("/settings");
    expect(SETTINGS_TABS.household.href).toBe("/settings/household");
  });

  it("names each tab's sibling, so the shell knows what to prefetch", () => {
    expect(siblingSettingsTab("you")).toBe("household");
    expect(siblingSettingsTab("household")).toBe("you");
  });

  it("parses the switch's value and ignores anything that isn't a tab", () => {
    expect(settingsTabFromValue("household", "you")).toBe("household");
    expect(settingsTabFromValue("you", "household")).toBe("you");
    expect(settingsTabFromValue("", "household")).toBe("household");
  });

  it("lists every tab exactly once, personal first", () => {
    expect(SETTINGS_TAB_ORDER).toEqual(["you", "household"]);
    expect(new Set(SETTINGS_TAB_ORDER).size).toBe(Object.keys(SETTINGS_TABS).length);
  });
});
