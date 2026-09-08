/**
 * The integration-test database (ADR-0006).
 *
 * One fresh `new PGlite()` per test file — in-memory, in-process, no Docker and
 * no CI service container. The schema is built by replaying the real migration
 * files, so a broken migration fails these tests rather than only production.
 *
 * The usual shape of a DB-integration test file:
 *
 * ```ts
 * const db = await createTestDatabase();
 * afterAll(() => closeTestDatabase(db));
 * beforeEach(() => truncateAll(db));
 * ```
 *
 * `createTestDatabase()` at module scope is fine — Vitest awaits a top-level
 * `await` in an ES module before running the file's tests.
 */

import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, createDatabase, type Database } from "@/db";

/** A fresh in-memory PostgreSQL with every migration applied. */
export async function createTestDatabase(): Promise<Database> {
  const db = createDatabase(new PGlite());
  await applyMigrations(db);
  return db;
}

/** Release the WASM instance. Call from `afterAll`. */
export async function closeTestDatabase(db: Database): Promise<void> {
  await db.$client.close();
}
