import { beforeEach, describe, expect, it } from "vitest";
import type {
  Child,
  ChildRepository,
  Household,
  HouseholdRepository,
  IdGenerator,
  Member,
  MemberRepository,
} from "@/domain";
import { bootstrapHousehold, isAllowlistedEmail } from "./bootstrapHousehold";

/** In-memory fakes — no DB, per `docs/testing.md` "Dependency injection first". */
function createFakeRepos() {
  const households = new Map<string, Household>();
  const members = new Map<string, Member>();
  const children = new Map<string, Child>();

  const householdRepo: HouseholdRepository = {
    async findById(id) {
      return households.get(id) ?? null;
    },
    async save(household) {
      households.set(household.id, household);
    },
  };

  const memberRepo: MemberRepository = {
    async findById(id) {
      return members.get(id) ?? null;
    },
    async findByEmail(email) {
      for (const member of members.values()) {
        if (member.email === email) return member;
      }
      return null;
    },
    async listByHousehold(householdId) {
      return [...members.values()].filter((m) => m.householdId === householdId);
    },
    async save(member) {
      members.set(member.id, member);
    },
  };

  const childRepo: ChildRepository = {
    async findById(id) {
      return children.get(id) ?? null;
    },
    async findByHousehold(householdId) {
      return [...children.values()].find((c) => c.householdId === householdId) ?? null;
    },
    async save(child) {
      children.set(child.id, child);
    },
  };

  return { households: householdRepo, members: memberRepo, children: childRepo };
}

/** A counter-based `IdGenerator`: `id-1`, `id-2`, … */
function createFakeIds(): IdGenerator {
  let counter = 0;
  return {
    next() {
      counter += 1;
      return `id-${counter}`;
    },
  };
}

const ALLOWLIST = ["alex@example.com", "bailey@example.com"] as const;

describe("isAllowlistedEmail", () => {
  it.each([
    ["alex@example.com", true],
    ["bailey@example.com", true],
    ["ALEX@EXAMPLE.COM", true],
    [" alex@example.com ", true],
    ["casey@example.com", false],
  ])("%s -> %s", (email, expected) => {
    expect(isAllowlistedEmail(email, ALLOWLIST)).toBe(expected);
  });
});

describe("bootstrapHousehold", () => {
  let repos: ReturnType<typeof createFakeRepos>;
  let ids: IdGenerator;

  beforeEach(() => {
    repos = createFakeRepos();
    ids = createFakeIds();
  });

  it("creates the household, both members and the child on first call", async () => {
    const household = await bootstrapHousehold({ ...repos, ids }, ALLOWLIST);

    expect(household).toEqual({
      id: "id-1",
      name: "Our household",
      memberIds: ["id-2", "id-3"],
      childId: "id-4",
    });

    const first = await repos.members.findByEmail("alex@example.com");
    const second = await repos.members.findByEmail("bailey@example.com");
    expect(first).toEqual({
      id: "id-2",
      householdId: "id-1",
      name: "Alex",
      email: "alex@example.com",
    });
    expect(second).toEqual({
      id: "id-3",
      householdId: "id-1",
      name: "Bailey",
      email: "bailey@example.com",
    });
    expect(await repos.children.findByHousehold("id-1")).toEqual({
      id: "id-4",
      householdId: "id-1",
      name: "Child",
    });
  });

  it("is idempotent: a second call for the same allowlist returns the same household", async () => {
    const first = await bootstrapHousehold({ ...repos, ids }, ALLOWLIST);
    const second = await bootstrapHousehold({ ...repos, ids }, ALLOWLIST);

    expect(second).toEqual(first);
    expect(await repos.members.listByHousehold(first.id)).toHaveLength(2);
  });

  it("attaches to the existing household when only the second email has signed in before", async () => {
    const created = await bootstrapHousehold({ ...repos, ids }, ALLOWLIST);

    // Simulate the first parent's Member row existing but the second parent
    // being the one bootstrapping now — same allowlist, no new ids consumed.
    const again = await bootstrapHousehold({ ...repos, ids }, ALLOWLIST);

    expect(again).toEqual(created);
  });

  it("throws if a member references a household that no longer exists", async () => {
    await repos.members.save({
      id: "orphan",
      householdId: "missing-household",
      name: "Orphan",
      email: "alex@example.com",
    });

    await expect(bootstrapHousehold({ ...repos, ids }, ALLOWLIST)).rejects.toThrow(
      /references missing household/,
    );
  });
});
