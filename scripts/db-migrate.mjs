#!/usr/bin/env node
/**
 * The production migration runner — replay the on-disk Drizzle migrations
 * against a real Postgres (Neon) database.
 *
 *   pnpm db:migrate                       # apply pending migrations to $DATABASE_URL
 *   DATABASE_URL='postgres://…' pnpm db:migrate
 *   node scripts/db-migrate.mjs inspect   # report state, apply nothing
 *
 * This is the Neon counterpart to `src/db/migrate.ts` (`applyMigrations`),
 * which does the same replay against in-process PGlite for the test suite
 * (ADR-0006). Both read the SAME `.sql` files and the SAME
 * `meta/_journal.json`; the only difference is the driver —
 * `drizzle-orm/neon-serverless` here (a real `Pool`, matching
 * `src/db/neon.ts`), `drizzle-orm/pglite` there.
 *
 * `drizzle-kit migrate` is not used: `drizzle.config.ts` deliberately carries
 * no `dbCredentials`, so nothing in the diff/generate path can be pointed at a
 * live database by accident. This script reads `DATABASE_URL` from the
 * environment at call time instead.
 *
 * Idempotent: Drizzle records every applied migration in
 * `drizzle.__drizzle_migrations` and decides what to run by comparing the
 * newest recorded `created_at` against each journal entry's timestamp. The
 * whole pending batch runs inside one transaction (see `pg-core` `migrate`), so
 * a failure rolls every pending migration back — the schema never lands
 * half-migrated.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(HERE, "..", "src", "db", "migrations");

const cmd = process.argv[2] ?? "migrate";
const url = process.env.DATABASE_URL;

if (cmd !== "inspect" && cmd !== "migrate") {
  console.error("usage: node scripts/db-migrate.mjs [migrate|inspect]");
  process.exit(1);
}
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const journal = JSON.parse(
  readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
);
const expected = journal.entries.length;
const redacted = url.replace(/:\/\/[^@]*@/, "://***@");

const pool = new Pool({ connectionString: url });

/** Number of migrations Drizzle has recorded, or null if its table is absent. */
async function recordedCount() {
  try {
    const { rows } = await pool.query(
      "select count(*)::int as n from drizzle.__drizzle_migrations",
    );
    return rows[0].n;
  } catch (err) {
    // The bookkeeping schema/table only exists once a migration has run. Any
    // other failure (auth, network, permissions) is not "fresh" — let it throw.
    if (err?.code === "42P01" || err?.code === "3F000") return null;
    throw err;
  }
}

try {
  const before = await recordedCount();
  console.log(`\n  database:  ${redacted}`);
  console.log(
    `  recorded:  ${before === null ? "none (fresh database)" : `${before}/${expected} migrations`}`,
  );
  console.log(`  on disk:   ${expected} migrations\n`);

  if (cmd === "inspect") {
    const pending = expected - (before ?? 0);
    console.log(
      pending > 0
        ? `  ${pending} migration(s) would be applied by 'pnpm db:migrate'.\n`
        : "  Up to date — nothing to apply.\n",
    );
    await pool.end();
    process.exit(0);
  }

  if (before === expected) {
    console.log("  Up to date — nothing to apply.\n");
    await pool.end();
    process.exit(0);
  }

  console.log("  applying…");
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
  const after = await recordedCount();
  console.log(`  done — ${after}/${expected} migrations recorded.\n`);
  await pool.end();
} catch (err) {
  // neon-serverless surfaces connection failures as ErrorEvent, not Error,
  // sometimes with an empty message — fall through those to something useful.
  const message = err?.message || err?.error?.message || err?.code || String(err);
  console.error(`\n  migration failed: ${message}`);
  console.error("  The pending batch runs in one transaction — it rolled back, schema unchanged.");
  await pool.end().catch(() => {});
  process.exit(1);
}
