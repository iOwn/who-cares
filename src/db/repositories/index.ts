/**
 * Repository adapters for the root of the FK graph (issue #38).
 *
 * One factory per port in `src/domain/ports`. Each takes a `DbExecutor` — the
 * `Database` itself or an open transaction — so a caller can compose several
 * repositories into one atomic unit of work. `createRepositories()` is the
 * convenience for the common case of wanting all three over the same executor.
 */

import type { ChildRepository, HouseholdRepository, MemberRepository } from "@/domain";
import type { DbExecutor } from "../client";
import { createChildRepository } from "./child";
import { createHouseholdRepository } from "./household";
import { createMemberRepository } from "./member";

export { createChildRepository, createHouseholdRepository, createMemberRepository };

export interface Repositories {
  readonly households: HouseholdRepository;
  readonly members: MemberRepository;
  readonly children: ChildRepository;
}

export function createRepositories(db: DbExecutor): Repositories {
  return {
    households: createHouseholdRepository(db),
    members: createMemberRepository(db),
    children: createChildRepository(db),
  };
}
