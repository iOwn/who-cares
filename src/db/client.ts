/**
 * The database handle: a Drizzle instance bound to a PGlite client.
 *
 * PGlite is real PostgreSQL 17 compiled to WASM, running in-process (ADR-0006).
 * It is what the integration tier runs on — no Docker, no CI service container —
 * and the same `Database` type is what a Neon-backed adapter will produce, so
 * repositories never learn which one they are talking to.
 */

import type { PGlite } from "@electric-sql/pglite";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PgliteQueryResultHKT } from "drizzle-orm/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

export { schema };

/** A Drizzle database bound to a PGlite client. Carries `$client` for raw SQL. */
export type Database = ReturnType<typeof createDatabase>;

/**
 * Any handle a repository can run statements on: the `Database` itself, or a
 * transaction handed to a `db.transaction()` callback. Repositories accept this
 * rather than `Database` so a caller can compose several writes into one
 * transaction — which creating a household actually requires, since the
 * "exactly two members / one child" triggers only fire at `COMMIT`.
 */
export type DbExecutor = PgDatabase<PgliteQueryResultHKT, typeof schema>;

/** Wrap an existing PGlite client. The caller owns the client's lifetime. */
export function createDatabase(client: PGlite) {
  return drizzle(client, { schema, casing: "snake_case" });
}
