import { describe, expect, it } from "vitest";
import { MAX_MEMBER_NAME_LENGTH, normaliseMemberName, validateMemberName } from "./memberName";

describe("normaliseMemberName", () => {
  it("trims surrounding whitespace", () => {
    expect(normaliseMemberName("  Alex ")).toBe("Alex");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normaliseMemberName("Alex \t\n  P")).toBe("Alex P");
  });

  it("leaves an already-clean name alone", () => {
    expect(normaliseMemberName("Alex P")).toBe("Alex P");
  });
});

describe("validateMemberName", () => {
  it("accepts a normal name, normalised", () => {
    expect(validateMemberName("  Alex   P ")).toEqual({ ok: true, name: "Alex P" });
  });

  it("rejects an empty name", () => {
    expect(validateMemberName("")).toMatchObject({ ok: false });
  });

  it("rejects a whitespace-only name", () => {
    expect(validateMemberName("   \n ")).toMatchObject({ ok: false });
  });

  it("accepts a name exactly at the limit", () => {
    const name = "a".repeat(MAX_MEMBER_NAME_LENGTH);
    expect(validateMemberName(name)).toEqual({ ok: true, name });
  });

  it("rejects a name over the limit, measured after normalising", () => {
    expect(validateMemberName("a".repeat(MAX_MEMBER_NAME_LENGTH + 1))).toMatchObject({
      ok: false,
    });
    // Surrounding whitespace doesn't count towards the limit.
    const padded = `  ${"a".repeat(MAX_MEMBER_NAME_LENGTH)}  `;
    expect(validateMemberName(padded)).toMatchObject({ ok: true });
  });

  it("keeps emoji and non-Latin names", () => {
    expect(validateMemberName("Zoë 🌱")).toEqual({ ok: true, name: "Zoë 🌱" });
    expect(validateMemberName("李雷")).toEqual({ ok: true, name: "李雷" });
  });
});
