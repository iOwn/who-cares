/**
 * Shared test-data factories (issue #26, `docs/testing.md` "Test data /
 * fixtures").
 *
 * Typed functions returning **plain domain objects** with sensible defaults and
 * shallow `Partial` overrides. No fluent builder, no `@faker-js`, no random —
 * determinism comes from fixed sentinel IDs, a fixed anchor date, and a
 * counter-based generator for bulk rows.
 *
 * Three consumers share this module: domain-logic tests (objects straight
 * against fake repos), the PGlite layer (a `seed(db, graph)` helper, #38), and
 * the E2E `/api/test/seed` route. Calendar dates cross the call boundary as
 * `'YYYY-MM-DD'` strings; only the internals here convert.
 */

import type {
  Absence,
  Assignment,
  CalendarDate,
  Child,
  ChildcarePattern,
  ChildcarePatternVersion,
  Closure,
  Household,
  Member,
  PickupRequest,
  Weekday,
} from '@/domain';

/* ------------------------------------------------------------------ *
 * Determinism: sentinel IDs, the anchor date, the bulk ID counter.
 * ------------------------------------------------------------------ */

/** The one household v1 runs. */
export const HOUSEHOLD_ID = 'household-1';
/** The two members. `m1` is the default actor in single-actor scenarios. */
export const MEMBER_1_ID = 'm1';
export const MEMBER_2_ID = 'm2';
/** The one child. */
export const CHILD_ID = 'child-1';

/**
 * The date every factory defaults relative to: **Monday 6 January 2025**.
 * A Monday keeps "the anchor is a childcare day under a Mon–Fri pattern" true
 * without extra arithmetic in tests.
 */
export const ANCHOR_DATE: CalendarDate = '2025-01-06';

let idCounter = 0;

/**
 * A counter-based ID for bulk rows (`closure-1`, `absence-2`, …). Call
 * `resetIdCounter()` in a `beforeEach` for stable IDs across a test file.
 */
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function resetIdCounter(): void {
  idCounter = 0;
}

/* ------------------------------------------------------------------ *
 * Calendar-date helpers (internal).
 * ------------------------------------------------------------------ */

/** Add `n` days to a `'YYYY-MM-DD'` date, staying in `'YYYY-MM-DD'`. */
function addDays(date: CalendarDate, n: number): CalendarDate {
  const [year, month, day] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** A fixed UTC instant on `date` at `hour:00`, for timestamp fields. */
function instantOn(date: CalendarDate, hour = 9): Date {
  const hh = String(hour).padStart(2, '0');
  return new Date(`${date}T${hh}:00:00.000Z`);
}

/* ------------------------------------------------------------------ *
 * Per-entity factories.
 * ------------------------------------------------------------------ */

export function makeHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: HOUSEHOLD_ID,
    name: 'The Test Household',
    memberIds: [MEMBER_1_ID, MEMBER_2_ID],
    childId: CHILD_ID,
    ...overrides,
  };
}

export function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: MEMBER_1_ID,
    householdId: HOUSEHOLD_ID,
    name: 'Alex',
    email: 'alex@example.com',
    ...overrides,
  };
}

export function makeChild(overrides: Partial<Child> = {}): Child {
  return {
    id: CHILD_ID,
    householdId: HOUSEHOLD_ID,
    name: 'Sam',
    ...overrides,
  };
}

export function makeClosure(overrides: Partial<Closure> = {}): Closure {
  return {
    id: nextId('closure'),
    householdId: HOUSEHOLD_ID,
    date: ANCHOR_DATE,
    ...overrides,
  };
}

export function makeAbsence(overrides: Partial<Absence> = {}): Absence {
  return {
    id: nextId('absence'),
    householdId: HOUSEHOLD_ID,
    memberId: MEMBER_1_ID,
    startDate: ANCHOR_DATE,
    endDate: ANCHOR_DATE,
    ...overrides,
  };
}

export function makePickupRequest(
  overrides: Partial<PickupRequest> = {},
): PickupRequest {
  return {
    id: nextId('pickup-request'),
    householdId: HOUSEHOLD_ID,
    date: ANCHOR_DATE,
    requesterId: MEMBER_1_ID,
    recipientId: MEMBER_2_ID,
    absenceId: 'absence-1',
    state: 'Open',
    raisedAt: instantOn(ANCHOR_DATE, 8),
    ...overrides,
  };
}

export function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: nextId('assignment'),
    householdId: HOUSEHOLD_ID,
    date: ANCHOR_DATE,
    assigneeId: MEMBER_1_ID,
    source: 'direct-claim',
    createdAt: instantOn(ANCHOR_DATE, 9),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Childcare pattern: `pattern([...weekdays])` + `pattern.versions([...])`.
 * ------------------------------------------------------------------ */

/** A single-version pattern; `effectiveFrom` defaults to the anchor. */
function makeSingleVersionPattern(
  weekdays: readonly Weekday[],
  effectiveFrom: CalendarDate = ANCHOR_DATE,
): ChildcarePattern {
  return {
    id: nextId('pattern'),
    householdId: HOUSEHOLD_ID,
    versions: [{ weekdays: [...weekdays], effectiveFrom }],
  };
}

/**
 * A multi-version pattern (ADR-0002). Asserts strictly-ascending
 * `effectiveFrom` — a guard against tests declaring an incoherent history.
 */
function makeVersionedPattern(
  versions: readonly ChildcarePatternVersion[],
): ChildcarePattern {
  if (versions.length === 0) {
    throw new Error('pattern.versions requires at least one version');
  }
  for (let i = 1; i < versions.length; i += 1) {
    // `'YYYY-MM-DD'` compares chronologically as a string.
    if (versions[i].effectiveFrom <= versions[i - 1].effectiveFrom) {
      throw new Error(
        'pattern.versions requires strictly-ascending effectiveFrom; ' +
          `${versions[i].effectiveFrom} does not come after ` +
          `${versions[i - 1].effectiveFrom}`,
      );
    }
  }
  return {
    id: nextId('pattern'),
    householdId: HOUSEHOLD_ID,
    versions: versions.map((v) => ({
      weekdays: [...v.weekdays],
      effectiveFrom: v.effectiveFrom,
    })),
  };
}

export const pattern = Object.assign(makeSingleVersionPattern, {
  versions: makeVersionedPattern,
});

/* ------------------------------------------------------------------ *
 * Absence shorthand: `absence({ from, to })` or `absence({ from, days })`.
 * ------------------------------------------------------------------ */

export type AbsenceSpan =
  | { from: CalendarDate; to: CalendarDate }
  | { from: CalendarDate; days: number };

/**
 * Build an `Absence` from an inclusive `{ from, to }` range or a `{ from, days }`
 * duration (`days: 1` = a single day), normalised to `startDate` / `endDate`.
 * Extra `overrides` are applied on top.
 */
export function absence(
  span: AbsenceSpan,
  overrides: Partial<Absence> = {},
): Absence {
  let endDate: CalendarDate;
  if ('to' in span) {
    endDate = span.to;
  } else {
    if (!Number.isInteger(span.days) || span.days < 1) {
      throw new Error('absence({ from, days }) requires days >= 1');
    }
    endDate = addDays(span.from, span.days - 1);
  }
  return makeAbsence({ startDate: span.from, endDate, ...overrides });
}

/* ------------------------------------------------------------------ *
 * The one preset.
 * ------------------------------------------------------------------ */

/**
 * The full object graph for one household, ready to hand to a fake repo, the
 * PGlite `seed()` helper (#38), or the E2E seed route.
 */
export interface HouseholdGraph {
  readonly household: Household;
  readonly members: readonly [Member, Member];
  readonly child: Child;
  readonly pattern: ChildcarePattern;
  readonly closures: readonly Closure[];
  readonly absences: readonly Absence[];
  readonly pickupRequests: readonly PickupRequest[];
  readonly assignments: readonly Assignment[];
}

/**
 * The single shared preset: 2 members, 1 child, a Mon–Fri pattern effective
 * from the anchor, and no closures / absences / requests / assignments.
 * Scenario-specific setup stays inline in the test that needs it.
 */
export function makeTypicalHousehold(
  overrides: Partial<HouseholdGraph> = {},
): HouseholdGraph {
  return {
    household: makeHousehold(),
    members: [
      makeMember({ id: MEMBER_1_ID, name: 'Alex', email: 'alex@example.com' }),
      makeMember({ id: MEMBER_2_ID, name: 'Bailey', email: 'bailey@example.com' }),
    ],
    child: makeChild(),
    pattern: pattern(['mon', 'tue', 'wed', 'thu', 'fri']),
    closures: [],
    absences: [],
    pickupRequests: [],
    assignments: [],
    ...overrides,
  };
}
