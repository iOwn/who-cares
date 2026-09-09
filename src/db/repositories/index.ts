/**
 * Repository adapters for the FK graph (issues #38, #49, #51).
 *
 * One factory per port in `src/domain/ports`. Each takes a `DbExecutor` — the
 * `Database` itself or an open transaction — so a caller can compose several
 * repositories into one atomic unit of work. `createRepositories()` is the
 * convenience for the common case of wanting all of them over the same executor.
 */

import type {
  AbsenceRepository,
  AssignmentRepository,
  ChildcarePatternRepository,
  ChildRepository,
  ClosureRepository,
  HouseholdRepository,
  MemberRepository,
  PickupRequestRepository,
} from "@/domain";
import type { DbExecutor } from "../client";
import { createAbsenceRepository } from "./absence";
import { createAssignmentRepository } from "./assignment";
import { createChildRepository } from "./child";
import { createChildcarePatternRepository } from "./childcarePattern";
import { createClosureRepository } from "./closure";
import { createHouseholdRepository } from "./household";
import { createMemberRepository } from "./member";
import { createPickupRequestRepository } from "./pickupRequest";

export {
  createAbsenceRepository,
  createAssignmentRepository,
  createChildcarePatternRepository,
  createChildRepository,
  createClosureRepository,
  createHouseholdRepository,
  createMemberRepository,
  createPickupRequestRepository,
};

export interface Repositories {
  readonly households: HouseholdRepository;
  readonly members: MemberRepository;
  readonly children: ChildRepository;
  readonly childcarePattern: ChildcarePatternRepository;
  readonly closures: ClosureRepository;
  readonly absences: AbsenceRepository;
  readonly pickupRequests: PickupRequestRepository;
  readonly assignments: AssignmentRepository;
}

export function createRepositories(db: DbExecutor): Repositories {
  return {
    households: createHouseholdRepository(db),
    members: createMemberRepository(db),
    children: createChildRepository(db),
    childcarePattern: createChildcarePatternRepository(db),
    closures: createClosureRepository(db),
    absences: createAbsenceRepository(db),
    pickupRequests: createPickupRequestRepository(db),
    assignments: createAssignmentRepository(db),
  };
}
