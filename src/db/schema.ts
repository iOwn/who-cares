/**
 * The Drizzle schema — the **root of the FK graph** (issue #38).
 *
 * This module is the single source of truth `drizzle-kit generate` diffs to
 * produce the SQL migration files in `./migrations`. Nothing here is executed at
 * test time: the schema a test runs against is built by replaying those SQL
 * files (see `./migrate`), so a migration that drifts from this file — or that
 * simply does not parse — fails a test rather than only production.
 *
 * ## Why `slot` exists
 *
 * The domain's `Household.memberIds` is a readonly 2-tuple (`src/domain/types`),
 * so the two members need a stable, meaningful order that survives a round-trip
 * through the database. `slot` (1 or 2) carries that order and, together with
 * `UNIQUE (household_id, slot)`, caps a household at two members structurally.
 * The matching "at *least* two members / exactly one child" half of the
 * invariant cannot be expressed as a row-level constraint; it lives in the
 * deferred constraint triggers added by migration `0001` and is therefore
 * checked at `COMMIT`, which is why a household is always created inside a
 * transaction together with its members and child.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm/sql";

/** The single family unit the app serves; v1 runs exactly one. */
export const households = pgTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A parent — one of exactly two per household. `slot` is the member's position
 * in `Household.memberIds`, not a role: slot 1 is simply the first of the two.
 */
export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    name: text("name").notNull(),
    /** Sign-in identity; matched against the deploy-time allowlist (SPEC.md). */
    email: text("email").notNull(),
  },
  (table) => [
    check("members_slot_range", sql`${table.slot} in (1, 2)`),
    unique("members_household_slot_unique").on(table.householdId, table.slot),
    unique("members_email_unique").on(table.email),
  ],
);

/**
 * The person collected from childcare — exactly one per household, which the
 * `UNIQUE` on `household_id` caps structurally.
 */
export const children = pgTable("children", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .unique("children_household_unique")
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

/**
 * The childcare pattern (ADR-0002), stored as its ordered version list — one
 * row per `{weekdays, effectiveFrom}` entry, keyed **directly by household**.
 *
 * There is no parent `childcare_patterns` row: a household has exactly one
 * pattern, so its identity *is* the household. `ChildcarePatternRepository`
 * assembles a `ChildcarePattern` (whose `id` is the `householdId`) from these
 * rows, ordered by `effective_from` ascending.
 *
 * ## Table-shape choice: `weekdays` as a `text[]`, not normalized rows
 *
 * `weekdays` holds the domain `Weekday` union values as a Postgres `text[]`
 * rather than a `pattern_version_weekdays` join table. The set is tiny (0–7),
 * always read and written whole, and never queried by individual element — a
 * normalized design would buy nothing and cost a join on every derivation.
 * `UNIQUE (household_id, effective_from)` carries the "one version per
 * effective date" invariant; the domain's strictly-ascending-`effectiveFrom`
 * rule is enforced by the repository on write. A plain FK + that UNIQUE is
 * enough — no COMMIT-time trigger (unlike the household graph).
 */
export const childcarePatternVersions = pgTable(
  "childcare_pattern_versions",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Domain `Weekday` values (`"mon"`…`"sun"`); read/written as a whole set. */
    weekdays: text("weekdays").array().notNull(),
    effectiveFrom: date("effective_from").notNull(),
  },
  (table) => [
    unique("childcare_pattern_versions_household_effective_from_unique").on(
      table.householdId,
      table.effectiveFrom,
    ),
  ],
);

/**
 * A closure — a single date on which the childcare day the pattern would
 * include is cancelled (CONTEXT.md). Single-date rows, never a range: a holiday
 * week is several rows. `reason` is optional free text shown verbatim, with no
 * taxonomy. `UNIQUE (household_id, date)` caps it at one closure per date, which
 * is what `ClosureRepository.findByDate` (`Closure | null`) assumes.
 */
export const closures = pgTable(
  "closures",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    reason: text("reason"),
  },
  (table) => [unique("closures_household_date_unique").on(table.householdId, table.date)],
);

/**
 * A member's declaration that they are unavailable for pickup across an
 * inclusive `start_date`–`end_date` range (CONTEXT.md "Absence"). `label` and
 * `note` are free text and change no app behaviour. A single-day absence is one
 * row with `start_date == end_date`. Cancelling / shortening an absence is a
 * plain `UPDATE` / `DELETE` and never touches any `Assignment` the absence
 * previously drove (ADR-0003, CONTEXT.md).
 */
export const absences = pgTable("absences", {
  id: text("id").primaryKey(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  label: text("label"),
  note: text("note"),
});

/**
 * A pickup request (CONTEXT.md "Pickup request") — raised automatically when an
 * absence covers a childcare day that has no assignment and exactly one member
 * is absent. `state` moves `Open` → one terminal value and never reopens, so
 * `UNIQUE (household_id, date)` holds: a request is never re-raised for a date
 * it already covered. Both ADR-0003 48h clocks run from `raised_at`.
 *
 * `absence_id` is `ON DELETE SET NULL`, not `CASCADE` (migration `0006`): when
 * the absence behind a request is cancelled, `cancelAbsence` first moves the
 * request to its terminal `Withdrawn` state, then the absence row goes and the
 * request is left standing with `absence_id = NULL`. The terminal row must
 * survive so `UNIQUE (household_id, date)` keeps blocking a re-raise for that
 * date — "once Declined or Withdrawn … never re-raised" (CONTEXT.md, #5
 * catalogue). Cascading the rows away would silently re-open that door.
 */
export const pickupRequests = pgTable(
  "pickup_requests",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    absenceId: text("absence_id").references(() => absences.id, { onDelete: "set null" }),
    state: text("state").notNull().default("Open"),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "pickup_requests_state_valid",
      sql`${table.state} in ('Open', 'Accepted', 'Declined', 'Withdrawn')`,
    ),
    unique("pickup_requests_household_date_unique").on(table.householdId, table.date),
  ],
);

/**
 * The record of who is responsible for a given childcare day's pickup
 * (CONTEXT.md "Assignment"). `UNIQUE (household_id, date)` is the "at most one
 * per date" invariant; `assignee_id` is a member or `NULL` (nobody). Arises
 * from an accepted request or a direct claim (`source`) and stands on its own
 * once made — day state is always re-derived live from it, never cached
 * (ADR-0003). A deleted member nulls the assignee rather than dropping the row.
 */
export const assignments = pgTable(
  "assignments",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    assigneeId: text("assignee_id").references(() => members.id, { onDelete: "set null" }),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("assignments_source_valid", sql`${table.source} in ('accepted-request', 'direct-claim')`),
    unique("assignments_household_date_unique").on(table.householdId, table.date),
  ],
);

/* ------------------------------------------------------------------ *
 * Notifications (issue #55) — delivery mechanics, not domain vocabulary.
 * ------------------------------------------------------------------ */

/**
 * A browser Web Push subscription (SPEC.md "Push"). One row per opted-in
 * browser; `endpoint` is the push service URL and is unique. A push that comes
 * back `404`/`410` means the endpoint is dead — the sender drops the row.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: text("id").primaryKey(),
  memberId: text("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique("push_subscriptions_endpoint_unique"),
  /** The subscription's ECDH public key (`keys.p256dh`). */
  p256dh: text("p256dh").notNull(),
  /** The subscription's auth secret (`keys.auth`). */
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The 5-minute coalescing queue (issue #5, #55). Only the two settings events
 * (`childcare-pattern-changed`, `closure-added`) land here; everything else
 * dispatches immediately. `coalesce_key` identifies the record being edited
 * (`event:householdId` for the pattern, `event:householdId:date` for a
 * closure) and is unique, so an `upsert` on it pushes `send_after` forward and
 * replaces the payload — repeated edits within the window collapse into one
 * notification of the final state. Drained by `flushPendingNotifications`
 * (every server action + the daily cron).
 */
export const pendingNotifications = pgTable("pending_notifications", {
  id: text("id").primaryKey(),
  coalesceKey: text("coalesce_key").notNull().unique("pending_notifications_coalesce_key_unique"),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  sendAfter: timestamp("send_after", { withTimezone: true }).notNull(),
});

/**
 * The "both parents were already told this childcare day is at-risk" ledger
 * (issue #55, ADR-0004). Day state stays live-derived and unstored (ADR-0003);
 * this only records that the once-daily backstop notification went out, so a
 * later cron tick skips the day. One row per `(household, date)`.
 */
export const atRiskEscalations = pgTable(
  "at_risk_escalations",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** `day-at-risk-both-absent` (event 9) or `day-at-risk-escalated` (event 10). */
    event: text("event").notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.householdId, table.date] })],
);

/* ------------------------------------------------------------------ *
 * Relations — for Drizzle's relational query API.
 * ------------------------------------------------------------------ */

export const householdsRelations = relations(households, ({ many, one }) => ({
  members: many(members),
  child: one(children),
  childcarePatternVersions: many(childcarePatternVersions),
  closures: many(closures),
  absences: many(absences),
  pickupRequests: many(pickupRequests),
  assignments: many(assignments),
}));

export const absencesRelations = relations(absences, ({ one }) => ({
  household: one(households, {
    fields: [absences.householdId],
    references: [households.id],
  }),
  member: one(members, {
    fields: [absences.memberId],
    references: [members.id],
  }),
}));

export const pickupRequestsRelations = relations(pickupRequests, ({ one }) => ({
  household: one(households, {
    fields: [pickupRequests.householdId],
    references: [households.id],
  }),
  absence: one(absences, {
    fields: [pickupRequests.absenceId],
    references: [absences.id],
  }),
}));

export const assignmentsRelations = relations(assignments, ({ one }) => ({
  household: one(households, {
    fields: [assignments.householdId],
    references: [households.id],
  }),
}));

export const childcarePatternVersionsRelations = relations(childcarePatternVersions, ({ one }) => ({
  household: one(households, {
    fields: [childcarePatternVersions.householdId],
    references: [households.id],
  }),
}));

export const closuresRelations = relations(closures, ({ one }) => ({
  household: one(households, {
    fields: [closures.householdId],
    references: [households.id],
  }),
}));

export const membersRelations = relations(members, ({ one }) => ({
  household: one(households, {
    fields: [members.householdId],
    references: [households.id],
  }),
}));

export const childrenRelations = relations(children, ({ one }) => ({
  household: one(households, {
    fields: [children.householdId],
    references: [households.id],
  }),
}));

/* ------------------------------------------------------------------ *
 * Better Auth (issue #47) — self-hosted, magic-link sign-in.
 *
 * Deliberately a separate identity space from `members`, not the same table:
 * Better Auth's `user` model requires columns (`emailVerified`, its own
 * `createdAt`/`updatedAt`) that carry no domain meaning, and `members.slot`
 * is computed at insert time in a way Better Auth's adapter writes know
 * nothing about (`./repositories/member.ts`). The two are linked by email —
 * `getCurrentSession` in `src/auth` resolves a Better Auth session's
 * `user.email` to a `Member` via `MemberRepository.findByEmail` — not by a
 * shared primary key. `databaseHooks.user.create.after` (`src/auth/config.ts`)
 * is what actually creates the `Member` rows, gated by the email allowlist.
 *
 * Table and column shapes mirror Better Auth's own base schema exactly
 * (`@better-auth/core` `src/db/schema/*.ts`) — hand-written rather than
 * generated by the Better Auth CLI, kept in this one file so `drizzle-kit
 * generate` stays the single migration source for the whole database
 * (`docs/testing.md` "ORM: Drizzle"). Model keys passed to `drizzleAdapter`
 * are the Better Auth defaults (`user`, `session`, `account`, `verification`)
 * — table *names* are plural for consistency with the rest of this schema,
 * but the JS/TS symbol and the adapter's model key stay singular, which is
 * what the adapter's default (un-pluralized) lookup expects.
 */
export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique("users_email_unique"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique("sessions_token_unique"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Passkey credentials (issue #48) — the `@better-auth/passkey` plugin's table.
 *
 * Progressive enrollment only: a row is written from an already-signed-in
 * session on a trusted device, and lets that parent re-enter with the device's
 * platform authenticator instead of a fresh magic link. Magic link stays the
 * sole bootstrap + recovery path (SPEC.md "Auth"); deleting a row here just
 * drops the fast path.
 *
 * Column shapes mirror the plugin's expected model exactly
 * (`@better-auth/passkey` `schema.passkey.fields` — `name`, `publicKey`,
 * `userId`, `credentialID`, `counter`, `deviceType`, `backedUp`, `transports`,
 * `createdAt`, `aaguid`). The plugin marks `user_id` / `credential_id` as
 * indexed; we omit the explicit secondary indexes here for parity with the
 * base auth tables above (`sessions` / `accounts` carry none either). Table
 * name plural, JS symbol + adapter model key singular — same convention as the
 * base tables.
 */
export const passkey = pgTable("passkeys", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credential_id").notNull(),
  counter: integer("counter").notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull(),
  transports: text("transports"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  aaguid: text("aaguid"),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  passkeys: many(passkey),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, { fields: [passkey.userId], references: [user.id] }),
}));
