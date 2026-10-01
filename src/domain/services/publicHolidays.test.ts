/**
 * German public holidays, derived (issue #167, ADR-0020). Pure, framework-free
 * — no database (ADR-0005, "Dependency injection first").
 */

import { describe, expect, it } from "vitest";
import { pattern } from "@/testing";
import {
  easterSunday,
  GERMAN_STATES,
  type GermanState,
  mergeClosures,
  publicHolidayClosures,
  publicHolidaysIn,
  publicHolidayWindow,
} from "./publicHolidays";

describe("easterSunday", () => {
  it.each([
    [2023, "2023-04-09"],
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2000, "2000-04-23"],
  ])("Easter %i is %s", (year, expected) => {
    expect(easterSunday(year)).toBe(expected);
  });
});

describe("GERMAN_STATES", () => {
  it("lists exactly the 16 ISO 3166-2:DE codes", () => {
    expect(GERMAN_STATES.map((s) => s.code).sort()).toEqual(
      [
        "BW",
        "BY",
        "BE",
        "BB",
        "HB",
        "HH",
        "HE",
        "MV",
        "NI",
        "NW",
        "RP",
        "SL",
        "SN",
        "ST",
        "SH",
        "TH",
      ].sort(),
    );
  });
});

describe("publicHolidaysIn", () => {
  const NATIONWIDE = [
    "Neujahr",
    "Karfreitag",
    "Ostermontag",
    "Tag der Arbeit",
    "Christi Himmelfahrt",
    "Pfingstmontag",
    "Tag der Deutschen Einheit",
    "1. Weihnachtstag",
    "2. Weihnachtstag",
  ];

  it.each(GERMAN_STATES.map((s) => s.code))("includes all 9 nationwide holidays for %s", (code) => {
    const names = publicHolidaysIn(code, 2025).map((h) => h.name);
    for (const holiday of NATIONWIDE) {
      expect(names).toContain(holiday);
    }
  });

  it("2025 dates are correct for the nationwide holidays", () => {
    const holidays = Object.fromEntries(publicHolidaysIn("BE", 2025).map((h) => [h.name, h.date]));
    expect(holidays.Neujahr).toBe("2025-01-01");
    expect(holidays.Karfreitag).toBe("2025-04-18");
    expect(holidays.Ostermontag).toBe("2025-04-21");
    expect(holidays["Tag der Arbeit"]).toBe("2025-05-01");
    expect(holidays["Christi Himmelfahrt"]).toBe("2025-05-29");
    expect(holidays.Pfingstmontag).toBe("2025-06-09");
    expect(holidays["Tag der Deutschen Einheit"]).toBe("2025-10-03");
    expect(holidays["1. Weihnachtstag"]).toBe("2025-12-25");
    expect(holidays["2. Weihnachtstag"]).toBe("2025-12-26");
  });

  const hasHoliday = (state: GermanState, year: number, name: string) =>
    publicHolidaysIn(state, year).some((h) => h.name === name);

  it("Heilige Drei Könige: BW, BY, ST only", () => {
    for (const state of ["BW", "BY", "ST"] as const) {
      expect(hasHoliday(state, 2025, "Heilige Drei Könige")).toBe(true);
    }
    for (const state of ["BE", "NW", "SN"] as const) {
      expect(hasHoliday(state, 2025, "Heilige Drei Könige")).toBe(false);
    }
  });

  it("Internationaler Frauentag: BE, MV only", () => {
    for (const state of ["BE", "MV"] as const) {
      expect(hasHoliday(state, 2025, "Internationaler Frauentag")).toBe(true);
    }
    expect(hasHoliday("BW", 2025, "Internationaler Frauentag")).toBe(false);
  });

  it("Fronleichnam: BW, BY, HE, NW, RP, SL — and explicitly NOT SN/TH", () => {
    for (const state of ["BW", "BY", "HE", "NW", "RP", "SL"] as const) {
      expect(hasHoliday(state, 2025, "Fronleichnam")).toBe(true);
    }
    for (const state of ["SN", "TH", "BE"] as const) {
      expect(hasHoliday(state, 2025, "Fronleichnam")).toBe(false);
    }
  });

  it("Mariä Himmelfahrt: SL only — explicitly NOT BY (municipality-scoped there)", () => {
    expect(hasHoliday("SL", 2025, "Mariä Himmelfahrt")).toBe(true);
    expect(hasHoliday("BY", 2025, "Mariä Himmelfahrt")).toBe(false);
  });

  it("Weltkindertag: TH only", () => {
    expect(hasHoliday("TH", 2025, "Weltkindertag")).toBe(true);
    expect(hasHoliday("SN", 2025, "Weltkindertag")).toBe(false);
  });

  it("Reformationstag: BB, HB, HH, MV, NI, SN, SH, ST, TH", () => {
    for (const state of ["BB", "HB", "HH", "MV", "NI", "SN", "SH", "ST", "TH"] as const) {
      expect(hasHoliday(state, 2025, "Reformationstag")).toBe(true);
    }
    for (const state of ["BW", "BY", "NW", "RP", "SL", "BE"] as const) {
      expect(hasHoliday(state, 2025, "Reformationstag")).toBe(false);
    }
  });

  it("Allerheiligen: BW, BY, NW, RP, SL", () => {
    for (const state of ["BW", "BY", "NW", "RP", "SL"] as const) {
      expect(hasHoliday(state, 2025, "Allerheiligen")).toBe(true);
    }
    expect(hasHoliday("BE", 2025, "Allerheiligen")).toBe(false);
  });

  it("Buß- und Bettag: SN only, always the Wednesday before 23 November", () => {
    expect(hasHoliday("SN", 2025, "Buß- und Bettag")).toBe(true);
    expect(hasHoliday("BY", 2025, "Buß- und Bettag")).toBe(false);

    // Known real-world dates — the Wednesday strictly before 23 November,
    // which lands anywhere from 16 to 22 November depending on the year.
    const KNOWN: Record<number, string> = {
      2023: "2023-11-22",
      2024: "2024-11-20",
      2025: "2025-11-19",
      2026: "2026-11-18",
      2027: "2027-11-17",
    };
    for (const [year, expected] of Object.entries(KNOWN)) {
      const date = publicHolidaysIn("SN", Number(year)).find(
        (h) => h.name === "Buß- und Bettag",
      )?.date;
      expect(date).toBe(expected);
      const [y, m, d] = date?.split("-").map(Number) ?? [];
      expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay()).toBe(3); // Wednesday
    }
  });

  it("never derives the Augsburger Friedensfest (municipality-only)", () => {
    for (const state of GERMAN_STATES.map((s) => s.code)) {
      expect(hasHoliday(state, 2025, "Augsburger Friedensfest")).toBe(false);
    }
  });
});

describe("publicHolidayClosures", () => {
  // An early effectiveFrom so every date these tests use (back to 2025-01-01)
  // resolves to this version — `pattern()`'s own default effectiveFrom is the
  // 2025-01-06 test-factory anchor, which would exclude earlier dates here.
  const MON_FRI = pattern(["mon", "tue", "wed", "thu", "fri"], "2020-01-01");

  it("yields a closure for a holiday that falls on a pattern weekday", () => {
    const closures = publicHolidayClosures({
      householdId: "h1",
      state: "BY",
      pattern: MON_FRI,
      from: "2025-01-01",
      to: "2025-01-31",
    });
    // 2025-01-01 (Wed) and 2025-01-06 (Mon, Heilige Drei Könige, BY) both land
    // on pattern weekdays.
    expect(closures.map((c) => c.date)).toEqual(["2025-01-01", "2025-01-06"]);
    expect(closures.every((c) => c.kind === "public-holiday")).toBe(true);
    expect(closures.find((c) => c.date === "2025-01-01")?.reason).toBe("Neujahr");
  });

  it("excludes a holiday that falls on a non-pattern weekday (e.g. a weekend)", () => {
    // 2025-12-25 (1. Weihnachtstag) is a Thursday — included; 2025-11-01
    // (Allerheiligen, BY) is a Saturday — a Mon-Fri pattern must exclude it.
    const closures = publicHolidayClosures({
      householdId: "h1",
      state: "BY",
      pattern: MON_FRI,
      from: "2025-11-01",
      to: "2025-11-01",
    });
    expect(closures).toEqual([]);
  });

  it("spans multiple years inside the window", () => {
    const closures = publicHolidayClosures({
      householdId: "h1",
      state: "BE",
      pattern: MON_FRI,
      from: "2025-12-20",
      to: "2026-01-10",
    });
    expect(closures.map((c) => c.date)).toContain("2025-12-25");
    expect(closures.map((c) => c.date)).toContain("2026-01-01");
  });

  it("gives each derived closure a synthetic id, never colliding with a stored row", () => {
    const [closure] = publicHolidayClosures({
      householdId: "h1",
      state: "BE",
      pattern: MON_FRI,
      from: "2025-01-01",
      to: "2025-01-01",
    });
    expect(closure.id).toBe("holiday:BE:2025-01-01");
  });
});

describe("mergeClosures", () => {
  it("a stored closure on a date wins over a derived one for that same date", () => {
    const stored = [{ id: "c1", householdId: "h1", date: "2025-01-01", reason: "Custom" }];
    const derived = [
      {
        id: "holiday:BE:2025-01-01",
        householdId: "h1",
        date: "2025-01-01",
        reason: "Neujahr",
        kind: "public-holiday" as const,
      },
    ];
    const merged = mergeClosures(stored, derived);
    expect(merged).toEqual(stored);
  });

  it("unions closures on distinct dates, sorted", () => {
    const stored = [{ id: "c1", householdId: "h1", date: "2025-01-10" }];
    const derived = [
      {
        id: "holiday:BE:2025-01-01",
        householdId: "h1",
        date: "2025-01-01",
        reason: "Neujahr",
        kind: "public-holiday" as const,
      },
    ];
    const merged = mergeClosures(stored, derived);
    expect(merged.map((c) => c.date)).toEqual(["2025-01-01", "2025-01-10"]);
  });
});

describe("publicHolidayWindow", () => {
  it("spans 1 Jan of the previous year through 31 Dec two years out", () => {
    expect(publicHolidayWindow("2026-06-15")).toEqual({ from: "2025-01-01", to: "2028-12-31" });
  });
});
