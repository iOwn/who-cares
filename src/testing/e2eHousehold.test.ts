import { describe, expect, it } from "vitest";
import { buildE2eHouseholdGraph, E2E_MEMBER_NAMES, e2eMemberEmail } from "./e2eHousehold";

const EMAILS = ["Parent-A@Example.com", "parent-b@example.com"];

describe("buildE2eHouseholdGraph", () => {
  it("is makeTypicalHousehold with the configured emails, lower-cased, in slot order", () => {
    const graph = buildE2eHouseholdGraph(EMAILS);

    expect(graph.members).toHaveLength(2);
    expect(graph.members.map((m) => m.email)).toEqual([
      "parent-a@example.com",
      "parent-b@example.com",
    ]);
    expect(graph.members.map((m) => m.name)).toEqual([...E2E_MEMBER_NAMES]);
    expect(graph.household.memberIds).toEqual([graph.members[0].id, graph.members[1].id]);
    expect(graph.child.householdId).toBe(graph.household.id);
  });

  it("keeps the empty typical-household shape (no absences / requests / assignments)", () => {
    const graph = buildE2eHouseholdGraph(EMAILS);

    expect(graph.closures).toEqual([]);
    expect(graph.absences).toEqual([]);
    expect(graph.pickupRequests).toEqual([]);
    expect(graph.assignments).toEqual([]);
    expect(graph.pattern.versions[0].weekdays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });

  it("rejects anything but exactly two distinct emails", () => {
    expect(() => buildE2eHouseholdGraph(["only-one@example.com"])).toThrow(/two test emails/i);
    expect(() => buildE2eHouseholdGraph(["a@x.com", "b@x.com", "c@x.com"])).toThrow(
      /two test emails/i,
    );
    expect(() => buildE2eHouseholdGraph(["dup@x.com", "DUP@x.com"])).toThrow(/distinct/i);
  });
});

describe("e2eMemberEmail", () => {
  it("maps 'a' to slot 1 and 'b' to slot 2", () => {
    expect(e2eMemberEmail(EMAILS, "a")).toBe("parent-a@example.com");
    expect(e2eMemberEmail(EMAILS, "b")).toBe("parent-b@example.com");
  });
});
