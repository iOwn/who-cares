/**
 * The migration runner (ADR-0006).
 *
 * ## The convention
 *
 * Migrations live in `src/db/migrations/` as plain `.sql` files named
 * `NNNN_snake_case_name.sql`, listed in order in `migrations/meta/_journal.json`.
 * Both are produced by `drizzle-kit`, never hand-numbered:
 *
 * - `pnpm db:generate --name <name>` diffs `src/db/schema.ts` against the last
 *   snapshot and writes the SQL it takes to get there.
 * - `pnpm db:generate:custom --name <name>` writes an empty file to fill in by
 *   hand, for anything the diff cannot express — triggers, functions, data
 *   backfills. `0001_household_graph_constraints.sql` is one of these.
 *
 * Statements inside a file are separated by `--> statement-breakpoint`.
 * Migrations are append-only: an applied file is never edited, because Drizzle
 * records each file's hash and a changed hash is a corrupted history.
 *
 * ## Why this runs in tests
 *
 * `applyMigrations()` reads those files off disk and executes them — it is not a
 * re-implementation of the schema, and there is no `CREATE TABLE` anywhere in
 * the test setup. A migration that does not parse, or that contradicts an
 * earlier one, fails every integration test rather than only production.
 */

import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "./client";

/**
 * Absolute path to the migrations directory, resolved from this module rather
 * than the working directory so it holds under Vitest, `next build`, and a
 * script run from anywhere.
 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url));

/**
 * Build the schema by replaying every migration file that has not run yet.
 * Idempotent: Drizzle tracks applied migrations in its own bookkeeping table.
 *
 * `migrationsFolder` is overridable only so the runner itself can be tested
 * against a deliberately broken migration; production callers pass nothing.
 */
export async function applyMigrations(
  db: Database,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  await migrate(db, { migrationsFolder });
}
