/**
 * The migration runner (ADR-0006): the schema an integration test sees is
 * whatever the real `.sql` files produce, and a file that does not parse fails
 * a test.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, describe, expect, it } from "vitest";
import { applyMigrations, createDatabase, MIGRATIONS_FOLDER } from "@/db";

/** One fresh PGlite for this file (ADR-0006). */
const db = createDatabase(new PGlite());
await applyMigrations(db);

afterAll(async () => {
  await db.$client.close();
});

async function tableNames(): Promise<string[]> {
  const result = await db.$client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
  );
  return result.rows.map((row) => row.table_name);
}

describe("migration file convention", () => {
  it("lists every migration file in the journal, in NNNN_name order", async () => {
    const journal = JSON.parse(
      await readFile(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
    ) as { entries: { tag: string }[] };
    const files = (await readdir(MIGRATIONS_FOLDER)).filter((name) => name.endsWith(".sql")).sort();

    expect(files).toEqual(journal.entries.map((entry) => `${entry.tag}.sql`));
    for (const file of files) {
      expect(file).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
    }
  });
});

describe("applyMigrations", () => {
  it("builds the schema from the migration files", async () => {
    expect(await tableNames()).toEqual([
      "absences",
      "accounts",
      "assignments",
      "at_risk_escalations",
      "childcare_pattern_versions",
      "children",
      "closures",
      "households",
      "members",
      "passkeys",
      "pickup_requests",
      "push_subscriptions",
      "sessions",
      "users",
      "verifications",
    ]);
  });

  it("records each applied migration so a re-run is a no-op", async () => {
    const journal = JSON.parse(
      await readFile(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
    ) as { entries: unknown[] };
    const migrationCount = journal.entries.length;

    const before = await db.$client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`,
    );
    expect(before.rows[0].count).toBe(migrationCount);

    await applyMigrations(db);

    const after = await db.$client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`,
    );
    expect(after.rows[0].count).toBe(migrationCount);
    expect(await tableNames()).toEqual([
      "absences",
      "accounts",
      "assignments",
      "at_risk_escalations",
      "childcare_pattern_versions",
      "children",
      "closures",
      "households",
      "members",
      "passkeys",
      "pickup_requests",
      "push_subscriptions",
      "sessions",
      "users",
      "verifications",
    ]);
  });

  it("drops the admin-plugin columns added by 0009 and removed by 0010 (issue #118)", async () => {
    const result = await db.$client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (table_name, column_name) IN (
           ('users', 'role'),
           ('users', 'banned'),
           ('users', 'ban_reason'),
           ('users', 'ban_expires'),
           ('sessions', 'impersonated_by')
         )`,
    );
    expect(result.rows).toEqual([]);
  });

  it("adds households.bundesland as a nullable column with a 16-code check constraint (issue #167)", async () => {
    const column = await db.$client.query<{ is_nullable: string; column_default: string | null }>(
      `SELECT is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'households' AND column_name = 'bundesland'`,
    );
    expect(column.rows).toEqual([{ is_nullable: "YES", column_default: null }]);

    await expect(
      db.$client.query(
        `INSERT INTO households (id, name, bundesland) VALUES ('h-bad', 'Bad', 'XX')`,
      ),
    ).rejects.toThrow(/households_bundesland_valid/);

    // The check itself is immediate (not deferred like the member/child-graph
    // triggers — migration `0001`), so a valid value passes it inside a
    // transaction this test then rolls back, never touching the two-member /
    // one-child invariant a bare household row would otherwise violate at
    // COMMIT.
    await db.$client.exec(
      `BEGIN;
       INSERT INTO households (id, name, bundesland) VALUES ('h-ok', 'OK', 'BY');
       ROLLBACK;`,
    );
  });

  it("creates the deferred household-graph constraint triggers", async () => {
    const result = await db.$client.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`,
    );
    expect(result.rows.map((row) => row.tgname)).toEqual([
      "children_graph_complete",
      "households_graph_complete",
      "members_graph_complete",
    ]);
  });

  it("fails loudly on a migration that does not parse", async () => {
    const folder = await mkdtemp(join(tmpdir(), "whocares-broken-migrations-"));
    try {
      await writeFile(
        join(folder, "0000_broken.sql"),
        `CREATE TABLE oops (id text PRIMARY KEY, ;`,
        "utf8",
      );
      await mkdir(join(folder, "meta"), { recursive: true });
      await writeFile(
        join(folder, "meta", "_journal.json"),
        JSON.stringify({
          version: "7",
          dialect: "postgresql",
          entries: [{ idx: 0, version: "7", when: 0, tag: "0000_broken", breakpoints: true }],
        }),
        "utf8",
      );

      const broken = createDatabase(new PGlite());
      try {
        await expect(applyMigrations(broken, folder)).rejects.toThrow(/Failed query/i);

        // …and leaves nothing behind: the whole file rolls back.
        const tables = await broken.$client.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
        );
        expect(tables.rows).toEqual([]);
      } finally {
        await broken.$client.close();
      }
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
