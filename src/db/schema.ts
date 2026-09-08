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
import { check, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
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

/* ------------------------------------------------------------------ *
 * Relations — for Drizzle's relational query API.
 * ------------------------------------------------------------------ */

export const householdsRelations = relations(households, ({ many, one }) => ({
  members: many(members),
  child: one(children),
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
