import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit` config — used by `pnpm db:generate` only.
 *
 * Generation is a pure schema diff and needs no database connection; the
 * resulting SQL files under `src/db/migrations/` are what actually builds the
 * schema, both in the PGlite integration tests (`src/db/migrate.ts`) and, later,
 * against Neon. `dbCredentials` is deliberately absent so nothing here can be
 * pointed at a live database by accident — there is no `db:push` script.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
});
