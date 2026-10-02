/**
 * Framework-free domain entity types (ADR-0005).
 *
 * ZERO `next/*` imports live in this directory — ever. These are plain data
 * shapes; behaviour lives in domain services that take the repository and
 * service ports in `./ports`.
 *
 * ## Calendar-date representation
 *
 * A **calendar date** (a childcare day, an absence bound, a closure date) is a
 * bare `'YYYY-MM-DD'` string — no time, no zone. It is the simplest defensible
 * choice: lexical order equals chronological order, equality is `===`, it
 * round-trips through JSON and Postgres `date` columns unchanged, and it never
 * drifts across a timezone the way a `Date` pinned to UTC-midnight can. The
 * fixture factories accept `'YYYY-MM-DD'` strings at the call boundary and do
 * any conversion internally.
 *
 * A **timestamp / instant** (when a pickup request was raised, when an
 * assignment was recorded) is a real `Date`. The at-risk logic compares
 * `clock.now()` against two 48h thresholds (ADR-0003), which is instant
 * arithmetic, not calendar arithmetic.
 */

/** A bare calendar date, `'YYYY-MM-DD'`. See the module doc comment. */
export type CalendarDate = string;

/** A day of the week the childcare pattern can include. */
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** One of the 16 German states, ISO 3166-2:DE code (ADR-0020, issue #167). */
export type GermanState =
  | "BW"
  | "BY"
  | "BE"
  | "BB"
  | "HB"
  | "HH"
  | "HE"
  | "MV"
  | "NI"
  | "NW"
  | "RP"
  | "SL"
  | "SN"
  | "ST"
  | "SH"
  | "TH";

/**
 * The 16 German states, ISO 3166-2:DE code + German display name, in that
 * code's alphabetical order — the order the Bundesland `Select` renders.
 */
export const GERMAN_STATES: ReadonlyArray<{ readonly code: GermanState; readonly name: string }> = [
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "BE", name: "Berlin" },
  { code: "BB", name: "Brandenburg" },
  { code: "HB", name: "Bremen" },
  { code: "HH", name: "Hamburg" },
  { code: "HE", name: "Hessen" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SL", name: "Saarland" },
  { code: "SN", name: "Sachsen" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "TH", name: "Thüringen" },
];

const GERMAN_STATE_CODES: ReadonlySet<string> = new Set(GERMAN_STATES.map((s) => s.code));

/** `true` iff `value` is one of the 16 ISO 3166-2:DE state codes. */
export function isGermanState(value: string): value is GermanState {
  return GERMAN_STATE_CODES.has(value);
}

/** The single family unit the app serves; v1 runs exactly one. */
export interface Household {
  readonly id: string;
  readonly name: string;
  /**
   * Exactly two members per household (CONTEXT.md; SPEC.md non-goals). A
   * readonly 2-tuple so the "two parents" invariant is carried by the type.
   */
  readonly memberIds: readonly [string, string];
  /** Exactly one child per household. */
  readonly childId: string;
  /**
   * The German state whose public holidays are derived into the household's
   * closures (ADR-0020, issue #167) — `undefined` when unset, which
   * reproduces pre-#167 behaviour exactly (no derived holidays). See
   * `publicHolidaysIn` in `./services/publicHolidays`.
   */
  readonly bundesland?: GermanState;
}

/** A parent — one of exactly two per household — who can be held responsible for pickups. */
export interface Member {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
  /** Sign-in identity; matched against the deploy-time allowlist (SPEC.md). */
  readonly email: string;
}

/** The person collected from childcare. Carries only a display name in v1. */
export interface Child {
  readonly id: string;
  readonly householdId: string;
  readonly name: string;
}

/** One `{weekdays, effectiveFrom}` entry in a childcare pattern's version list. */
export interface ChildcarePatternVersion {
  readonly weekdays: readonly Weekday[];
  /** The pattern applies from this date onward, until the next version's date. */
  readonly effectiveFrom: CalendarDate;
}

/**
 * The set of weekdays the child is normally in childcare, versioned by
 * effective date (ADR-0002). One per household. Deriving the childcare days for
 * a given date always resolves whichever version was in effect *then*, so past
 * derivation stays stable as the household's current pattern changes.
 */
export interface ChildcarePattern {
  readonly id: string;
  readonly householdId: string;
  /** Ordered by strictly-ascending `effectiveFrom`; never empty. */
  readonly versions: readonly ChildcarePatternVersion[];
}

/**
 * How a `Closure` came to exist. `"manual"` (the default — absent `kind` means
 * manual, same convention as `reason`) is a parent's own entry, stored and
 * editable. `"public-holiday"` (ADR-0020, issue #167) is derived at read time
 * from the household's `bundesland` and never stored or editable — see
 * `publicHolidayClosures` in `./services/publicHolidays`.
 */
export type ClosureKind = "manual" | "public-holiday";

/** `true` iff `closure` is a derived public-holiday closure, not a stored row. */
export function isPublicHolidayClosure(closure: Pick<Closure, "kind">): boolean {
  return closure.kind === "public-holiday";
}

/**
 * A single date on which a weekday the pattern would include has no childcare
 * after all. A multi-day closure is several `Closure` rows, not a range
 * (CONTEXT.md). `reason` itself still carries no taxonomy — free text, shown
 * verbatim; `kind` is provenance, not a subject category, and for a public
 * holiday it holds the holiday's own German name.
 */
export interface Closure {
  readonly id: string;
  readonly householdId: string;
  readonly date: CalendarDate;
  /** Optional free text; no taxonomy. For a public holiday, its German name. */
  readonly reason?: string;
  /** Absent ⇒ `"manual"`, the same optional-property convention as `reason`. */
  readonly kind?: ClosureKind;
  /**
   * The facility is closed but the child still needs looking after (a
   * staff-training day, the summer break) — the day **stays a childcare day**
   * (ADR-0021, issue #166), so it still needs an owner, can raise a pickup
   * request and can go at-risk. Absent ⇒ `false`, today's behaviour: the closure
   * removes the day. A derived public holiday never needs cover.
   */
  readonly needsCover?: boolean;
}

/** `true` iff `closure` closes the facility but keeps the day a childcare day. */
export function closureNeedsCover(closure: Pick<Closure, "needsCover">): boolean {
  return closure.needsCover === true;
}

/**
 * A member's declaration that they are unavailable for pickup across a range of
 * consecutive dates, `startDate`–`endDate` **inclusive** (CONTEXT.md). The
 * `label` and `note` are free text and change no app behaviour.
 */
export interface Absence {
  readonly id: string;
  readonly householdId: string;
  readonly memberId: string;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  readonly label?: string;
  readonly note?: string;
}

/**
 * The lifecycle states of a pickup request. `Open` is the only non-terminal
 * state; a request never reopens and is never re-raised (CONTEXT.md).
 */
export const PICKUP_REQUEST_STATES = ["Open", "Accepted", "Declined", "Withdrawn"] as const;

export type PickupRequestState = (typeof PICKUP_REQUEST_STATES)[number];

/**
 * Raised automatically when an absence covers a childcare day that has no
 * existing assignment and exactly one member is absent that day; asks the other
 * member to take responsibility. Moves from `Open` to exactly one terminal
 * state and stops there.
 */
export interface PickupRequest {
  readonly id: string;
  readonly householdId: string;
  /** The childcare day whose pickup this request is about. */
  readonly date: CalendarDate;
  /** The absent member whose absence raised the request. */
  readonly requesterId: string;
  /** The member being asked to take responsibility. */
  readonly recipientId: string;
  /**
   * The absence that triggered the request, or `null` once that absence has
   * been cancelled. The request row itself outlives its absence: it moves to a
   * terminal state first and then stands with `absenceId === null`, so the
   * "one request per date, never re-raised" invariant still holds (CONTEXT.md).
   */
  readonly absenceId: string | null;
  readonly state: PickupRequestState;
  /**
   * When the request was opened. Both 48h at-risk clocks run from here
   * (ADR-0003): 48h since raised, and 48h before `date`.
   */
  readonly raisedAt: Date;
}

/** How an assignment came to be. */
export type AssignmentSource = "accepted-request" | "direct-claim" | "third-party";

/**
 * The record of who is responsible for collecting the child on a given
 * childcare day. At most one per date; `assigneeId` is a member or `null`
 * (nobody). Stands on its own once made — it does not change retroactively if
 * the pickup request or absence behind it is later cancelled (CONTEXT.md,
 * ADR-0003).
 */
export interface Assignment {
  readonly id: string;
  readonly householdId: string;
  readonly date: CalendarDate;
  /** A member, or `null` for nobody — always `null` for a `third-party` cover. */
  readonly assigneeId: string | null;
  readonly source: AssignmentSource;
  /**
   * Who the third party is ("Grandma"), free text — set only on a `third-party`
   * assignment, and optional there. `null` otherwise.
   */
  readonly thirdPartyLabel: string | null;
  readonly createdAt: Date;
}
