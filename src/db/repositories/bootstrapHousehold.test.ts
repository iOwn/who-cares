/**
 * `bootstrapHousehold` (issue #47) against the real migration-built schema.
 *
 * The domain-logic tests in `src/domain/services/bootstrapHousehold.test.ts`
 * cover the service's behaviour with fake repos. This file covers the one
 * thing fakes cannot: that composing the real repositories into one
 * `db.transaction()` (the pattern the auth wiring uses) actually satisfies the
 * deferred "exactly two members / one child" constraint trigger (ADR-0006,
 * `src/db/schema.ts`).
 */

import { describe, expect, it } from "vitest";
import { createRepositories } from "@/db";
import { bootstrapHousehold, noopAdapters } from "@/domain";
import { closeTestDatabase, createTestDatabase, truncateAll } from "@/testing";

const ALLOWLIST = ["alex@example.com", "bailey@example.com"] as const;

describe("bootstrapHousehold against PGlite", () => {
  it("creates the household, both members and the child inside one transaction", async () => {
    const db = await createTestDatabase();
    try {
      const household = await db.transaction((tx) =>
        bootstrapHousehold(
          { ...createRepositories(tx), ids: noopAdapters.systemIdGenerator },
          ALLOWLIST,
        ),
      );

      const repos = createRepositories(db);
      expect(await repos.households.findById(household.id)).toEqual(household);
      expect((await repos.members.listByHousehold(household.id)).map((m) => m.email)).toEqual([
        "alex@example.com",
        "bailey@example.com",
      ]);
      expect(await repos.children.findByHousehold(household.id)).not.toBeNull();
    } finally {
      await truncateAll(db);
      await closeTestDatabase(db);
    }
  });

  it("is idempotent across separate transactions", async () => {
    const db = await createTestDatabase();
    try {
      const first = await db.transaction((tx) =>
        bootstrapHousehold(
          { ...createRepositories(tx), ids: noopAdapters.systemIdGenerator },
          ALLOWLIST,
        ),
      );
      const second = await db.transaction((tx) =>
        bootstrapHousehold(
          { ...createRepositories(tx), ids: noopAdapters.systemIdGenerator },
          ALLOWLIST,
        ),
      );

      expect(second).toEqual(first);
    } finally {
      await truncateAll(db);
      await closeTestDatabase(db);
    }
  });
});
