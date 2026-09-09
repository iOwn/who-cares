/**
 * The production database handle: a Drizzle instance bound to Neon.
 *
 * Deliberately `drizzle-orm/neon-serverless` (a `Pool` over a WebSocket, real
 * sessions) and NOT `drizzle-orm/neon-http` (one query per HTTP request,
 * stateless). The repository layer relies on `db.transaction()` to compose
 * several writes atomically — creating a household needs it, since "exactly
 * two members / one child" is a deferred constraint trigger that only fires
 * at `COMMIT` (`./schema.ts`) — and `neon-http`'s driver throws `"No
 * transactions support in neon-http driver"` for that call. `neon-serverless`
 * supports it because it holds a real connection, the same shape PGlite gives
 * the test suite (`./client.ts`).
 *
 * Relies on Node 22's native `WebSocket` global — `@neondatabase/serverless`
 * only needs an explicit `neonConfig.webSocketConstructor` (e.g. the `ws`
 * package) on Node ≤21, and `engines.node` (`package.json`) pins `22.x`.
 *
 * The `Pool` is a module-level singleton, reused across requests in the same
 * warm serverless instance — the standard Node.js (non-Edge) pattern. Vercel
 * Hobby's functions run on the Node.js runtime, not Edge, so the connection
 * does not need to be opened and closed within a single request the way the
 * `@neondatabase/serverless` README requires for Edge / Workers.
 */

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/** Wrap a Neon `Pool` for `connectionString`. Call once per process. */
export function createNeonDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema, casing: "snake_case" });
}
