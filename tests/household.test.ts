import { describe, expect, it } from "vitest";
import { resolveHouseholdName } from "@/lib/household";

describe("resolveHouseholdName", () => {
  it("uses the requested household name when provided", () => {
    expect(resolveHouseholdName("Ada", "The Lovelaces")).toBe("The Lovelaces");
  });

  it("trims whitespace from the requested name", () => {
    expect(resolveHouseholdName("Ada", "  The Lovelaces  ")).toBe(
      "The Lovelaces",
    );
  });

  it("falls back to '{name}'s Household' when left blank", () => {
    expect(resolveHouseholdName("Ada", "")).toBe("Ada's Household");
  });

  it("falls back when the requested name is only whitespace", () => {
    expect(resolveHouseholdName("Ada", "   ")).toBe("Ada's Household");
  });
});
