/**
 * Repository and service **ports** (ADR-0005).
 *
 * Method signatures only — no implementations, no DB, no `next/*`. Domain
 * services take these as constructor / parameter dependencies; tests inject
 * fakes, the app wires real adapters (PGlite-backed repositories in #38, Resend
 * mailer, `web-push` sender, etc.). No-op implementations for the service ports
 * live in `./adapters/noop`.
 *
 * All repository methods return `Promise`s so a real adapter can be async
 * without changing the interface.
 */

import type {
  Absence,
  Assignment,
  CalendarDate,
  Child,
  ChildcarePattern,
  Closure,
  Household,
  Member,
  PickupRequest,
} from "./types";

/* ------------------------------------------------------------------ *
 * Repository ports — one per persisted entity.
 * ------------------------------------------------------------------ */

export interface HouseholdRepository {
  findById(id: string): Promise<Household | null>;
  save(household: Household): Promise<void>;
}

export interface MemberRepository {
  findById(id: string): Promise<Member | null>;
  /** Matched exactly as given — callers normalise case before calling. */
  findByEmail(email: string): Promise<Member | null>;
  listByHousehold(householdId: string): Promise<Member[]>;
  save(member: Member): Promise<void>;
}

export interface ChildRepository {
  findById(id: string): Promise<Child | null>;
  findByHousehold(householdId: string): Promise<Child | null>;
  save(child: Child): Promise<void>;
}

export interface ChildcarePatternRepository {
  findByHousehold(householdId: string): Promise<ChildcarePattern | null>;
  save(pattern: ChildcarePattern): Promise<void>;
}

export interface ClosureRepository {
  listByHousehold(householdId: string): Promise<Closure[]>;
  findByDate(householdId: string, date: CalendarDate): Promise<Closure | null>;
  save(closure: Closure): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface AbsenceRepository {
  findById(id: string): Promise<Absence | null>;
  listByHousehold(householdId: string): Promise<Absence[]>;
  /** Absences whose inclusive `startDate`–`endDate` range covers `date`. */
  listCovering(householdId: string, date: CalendarDate): Promise<Absence[]>;
  save(absence: Absence): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface PickupRequestRepository {
  findById(id: string): Promise<PickupRequest | null>;
  findByDate(householdId: string, date: CalendarDate): Promise<PickupRequest | null>;
  listByHousehold(householdId: string): Promise<PickupRequest[]>;
  save(request: PickupRequest): Promise<void>;
}

export interface AssignmentRepository {
  findByDate(householdId: string, date: CalendarDate): Promise<Assignment | null>;
  listByHousehold(householdId: string): Promise<Assignment[]>;
  save(assignment: Assignment): Promise<void>;
  delete(id: string): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Service ports — injected side-effecting dependencies.
 * ------------------------------------------------------------------ */

/**
 * The clock, as an injected port (ADR-0005). At-risk logic compares `now()`
 * against two 48h thresholds (ADR-0003) and drives no timers of its own, so an
 * explicit `now()` beats fake timers.
 */
export interface Clock {
  now(): Date;
}

/**
 * A source of new entity ids, as an injected port — the same rationale as
 * `Clock`: a domain service that mints ids (household bootstrap, request /
 * assignment creation) takes this rather than calling `crypto.randomUUID()`
 * itself, so a test can supply deterministic ids.
 */
export interface IdGenerator {
  next(): string;
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

/** Transactional email (Resend in production). */
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export interface PushMessage {
  /** The recipient member's id; the adapter resolves stored subscriptions. */
  readonly memberId: string;
  readonly title: string;
  readonly body: string;
}

/** Web push (`web-push` + VAPID in production). */
export interface PushSender {
  send(message: PushMessage): Promise<void>;
}

/** A domain event to be delivered to a household member. */
export interface Notification {
  readonly recipientId: string;
  /** Event key from the notification catalogue (issue #5). */
  readonly event: string;
  readonly title: string;
  readonly body: string;
}

/**
 * The higher-level notification port: fans a domain event out to email + web
 * push together (one tier, no informational-only channel — SPEC.md). The
 * recipient matrix and 5-minute coalescing are the concern of the service
 * behind this port (issue #5), not of the callers.
 */
export interface Notifier {
  notify(notification: Notification): Promise<void>;
}
