/**
 * Repository adapters for the FK graph (issues #38, #49).
 *
 * One factory per port in `src/domain/ports`. Each takes a `DbExecutor` — the
 * `Database` itself or an open transaction — so a caller can compose several
 * repositories into one atomic unit of work. `createRepositories()` is the
 * convenience for the common case of wanting all of them over the same executor.
 */

import type {
  ChildcarePatternRepository,
  ChildRepository,
  ClosureRepository,
  HouseholdRepository,
  MemberRepository,
} from "@/domain";
import type { DbExecutor } from "../client";
import { createChildRepository } from "./child";
import { createChildcarePatternRepository } from "./childcarePattern";
import { createClosureRepository } from "./closure";
import { createHouseholdRepository } from "./household";
import { createMemberRepository } from "./member";

export {
  createChildcarePatternRepository,
  createChildRepository,
  createClosureRepository,
  createHouseholdRepository,
  createMemberRepository,
};

export interface Repositories {
  readonly households: HouseholdRepository;
  readonly members: MemberRepository;
  readonly children: ChildRepository;
  readonly childcarePattern: ChildcarePatternRepository;
  readonly closures: ClosureRepository;
}

export function createRepositories(db: DbExecutor): Repositories {
  return {
    households: createHouseholdRepository(db),
    members: createMemberRepository(db),
    children: createChildRepository(db),
    childcarePattern: createChildcarePatternRepository(db),
    closures: createClosureRepository(db),
  };
}
