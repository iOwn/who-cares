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
 * A single date on which a weekday the pattern would include has no childcare
 * after all. A multi-day closure is several `Closure` rows, not a range
 * (CONTEXT.md).
 */
export interface Closure {
  readonly id: string;
  readonly householdId: string;
  readonly date: CalendarDate;
  /** Optional free text; no taxonomy. */
  readonly reason?: string;
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
export type AssignmentSource = "accepted-request" | "direct-claim";

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
  /** A member, or `null` for nobody. */
  readonly assigneeId: string | null;
  readonly source: AssignmentSource;
  readonly createdAt: Date;
}
