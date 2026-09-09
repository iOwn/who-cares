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

/* ------------------------------------------------------------------ *
 * Relations — for Drizzle's relational query API.
 * ------------------------------------------------------------------ */

export const householdsRelations = relations(households, ({ many, one }) => ({
  members: many(members),
  child: one(children),
  childcarePatternVersions: many(childcarePatternVersions),
  closures: many(closures),
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

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
