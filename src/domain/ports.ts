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

/** One `(date, event)` the at-risk backstop has already notified about. */
export interface AtRiskEscalationRecord {
  readonly date: CalendarDate;
  readonly event: string;
}

/**
 * The "we already told both parents about this at-risk day" ledger (issue #55).
 * The once-daily cron (`runAtRiskEscalation`) reads it to skip `(date, event)`
 * pairs it has already notified and appends a row for each new one — day state
 * itself is never stored (ADR-0003), only the fact that a notification went out.
 */
export interface AtRiskEscalationRepository {
  /** `(date, event)` pairs in `householdId` already recorded as notified. */
  listNotified(householdId: string): Promise<AtRiskEscalationRecord[]>;
  /** Record a notification (idempotent on `(household, date, event)`). */
  record(householdId: string, date: CalendarDate, event: string, at: Date): Promise<void>;
}

/** One stored `PushSubscription` (issue #55) — the browser endpoint plus its keys. */
export interface StoredPushSubscription {
  readonly id: string;
  readonly memberId: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  /**
   * The subscribing browser's `User-Agent` (issue #90) — best-effort, nullable
   * (a client can withhold it). The `/settings` push card turns it into a
   * friendly "Chrome on macOS" row so a member can recognise and drop a device.
   */
  readonly userAgent?: string | null;
  /**
   * When the row was created (issue #90). Set on reads; a writer omits it and
   * the store defaults it. The push card shows it as "Added 3 days ago".
   */
  readonly createdAt?: Date;
}

/**
 * Server-side storage of Web Push subscriptions (issue #55, SPEC.md "Push").
 * Each browser that opts in stores one row; a push that comes back `404`/`410`
 * (the endpoint is dead) drops it via `deleteByEndpoint`.
 */
export interface PushSubscriptionRepository {
  listByMember(memberId: string): Promise<StoredPushSubscription[]>;
  save(subscription: StoredPushSubscription): Promise<void>;
  deleteByEndpoint(endpoint: string): Promise<void>;
}

/**
 * The 5-minute coalescing queue (issue #55). The two settings events
 * (pattern-changed, closure-added) land here instead of dispatching straight
 * away: `upsert` on the record's `coalesceKey` pushes `sendAfter` forward and
 * overwrites the payload with the latest state, so repeated edits collapse into
 * one notification. `listDue` / `delete` are the flush the cron and every
 * server action run.
 */
export interface PendingNotification {
  readonly id: string;
  readonly coalesceKey: string;
  readonly recipientId: string;
  readonly event: string;
  readonly title: string;
  readonly body: string;
  readonly sendAfter: Date;
}

export interface PendingNotificationRepository {
  upsert(pending: PendingNotification): Promise<void>;
  /**
   * Atomically **remove and return** every row whose `sendAfter` is at or
   * before `now` (a single `DELETE … RETURNING`). Claim-then-send: two
   * concurrent flushes — a Server Action racing the daily cron — never both
   * pick up the same row, so a coalesced notification is delivered once.
   */
  claimDue(now: Date): Promise<PendingNotification[]>;
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
  /**
   * Identity of the record this notification is about (`absence` / `pattern` /
   * `closure`), set **only** for a coalescable event (issue #5). The `Notifier`
   * uses it as the 5-minute-window key: two notifications with the same
   * `coalesceKey` collapse into one; different keys get independent windows.
   */
  readonly coalesceKey?: string;
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
