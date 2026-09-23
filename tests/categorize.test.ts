import { describe, expect, it } from "vitest";
import {
  applyCategoryRules,
  matchCategoryForRow,
  type RuleForMatching,
} from "@/lib/categorize";

// Pure unit tests — no DB, no Postgres container needed. This is exactly
// what keeping lib/categorize.ts free of `@/lib/db` calls buys: every rule
// combination below is just plain data in, plain data (or null) out.

/** Minimal helper for building a RuleForMatching fixture tersely. */
function rule(
  overrides: Partial<RuleForMatching> & { categoryId: string },
): RuleForMatching {
  return {
    matchType: "contains",
    pattern: "",
    priority: 10,
    ...overrides,
  };
}

describe("matchCategoryForRow", () => {
  it("matches 'contains' rules case-insensitively", () => {
    const rules = [
      rule({ matchType: "contains", pattern: "starbucks", categoryId: "cat-coffee" }),
    ];
    expect(matchCategoryForRow("STARBUCKS #123 SEATTLE", rules)).toBe("cat-coffee");
    expect(matchCategoryForRow("Starbucks Coffee", rules)).toBe("cat-coffee");
    expect(matchCategoryForRow("Not a match", rules)).toBeNull();
  });

  it("matches 'exact' rules case-insensitively against the whole description", () => {
    const rules = [
      rule({ matchType: "exact", pattern: "Rent Payment", categoryId: "cat-rent" }),
    ];
    expect(matchCategoryForRow("RENT PAYMENT", rules)).toBe("cat-rent");
    expect(matchCategoryForRow("rent payment", rules)).toBe("cat-rent");
    // Exact means exact — a superstring shouldn't match.
    expect(matchCategoryForRow("Rent Payment - March", rules)).toBeNull();
  });

  it("matches 'regex' rules case-insensitively", () => {
    const rules = [
      rule({ matchType: "regex", pattern: "^amzn.*mktp", categoryId: "cat-shopping" }),
    ];
    expect(matchCategoryForRow("AMZN Mktp US*1234", rules)).toBe("cat-shopping");
    expect(matchCategoryForRow("amzn.com/bill mktp", rules)).toBe("cat-shopping");
    expect(matchCategoryForRow("Not amazon at all", rules)).toBeNull();
  });

  it("a malformed regex pattern is treated as a non-match instead of throwing", () => {
    const rules: RuleForMatching[] = [
      rule({ matchType: "regex", pattern: "(unclosed", categoryId: "cat-broken" }),
    ];
    expect(() => matchCategoryForRow("anything", rules)).not.toThrow();
    expect(matchCategoryForRow("anything", rules)).toBeNull();
  });

  it("a malformed regex rule doesn't block a later, valid rule from matching", () => {
    const rules: RuleForMatching[] = [
      rule({
        matchType: "regex",
        pattern: "(unclosed",
        categoryId: "cat-broken",
        priority: 1,
      }),
      rule({
        matchType: "contains",
        pattern: "groceries",
        categoryId: "cat-groceries",
        priority: 2,
      }),
    ];
    expect(matchCategoryForRow("Weekly groceries run", rules)).toBe("cat-groceries");
  });

  it("when multiple rules match, the LOWER priority number wins (evaluated first)", () => {
    const rules: RuleForMatching[] = [
      rule({ matchType: "contains", pattern: "coffee", categoryId: "cat-general", priority: 10 }),
      rule({ matchType: "contains", pattern: "coffee", categoryId: "cat-specific", priority: 1 }),
    ];
    // Passed in "wrong" order on purpose — matchCategoryForRow must sort
    // by priority itself, not trust caller order.
    expect(matchCategoryForRow("Blue Bottle Coffee", rules)).toBe("cat-specific");
  });

  it("priority ordering is independent of array order", () => {
    const higherFirst: RuleForMatching[] = [
      rule({ matchType: "contains", pattern: "x", categoryId: "cat-a", priority: 5 }),
      rule({ matchType: "contains", pattern: "x", categoryId: "cat-b", priority: 1 }),
      rule({ matchType: "contains", pattern: "x", categoryId: "cat-c", priority: 3 }),
    ];
    const lowerFirst = [...higherFirst].reverse();
    expect(matchCategoryForRow("x", higherFirst)).toBe("cat-b");
    expect(matchCategoryForRow("x", lowerFirst)).toBe("cat-b");
  });

  it("returns null when no rule matches, leaving the row uncategorized", () => {
    const rules: RuleForMatching[] = [
      rule({ matchType: "contains", pattern: "coffee", categoryId: "cat-coffee" }),
    ];
    expect(matchCategoryForRow("Electric bill", rules)).toBeNull();
  });

  it("returns null against an empty rule set", () => {
    expect(matchCategoryForRow("Anything", [])).toBeNull();
  });
});

describe("applyCategoryRules", () => {
  it("resolves a categoryId (or null) per row id, independently for each row", () => {
    const rules: RuleForMatching[] = [
      rule({ matchType: "contains", pattern: "coffee", categoryId: "cat-coffee", priority: 1 }),
      rule({ matchType: "contains", pattern: "rent", categoryId: "cat-rent", priority: 2 }),
    ];
    const rows = [
      { id: "row-1", rawDescription: "Blue Bottle Coffee" },
      { id: "row-2", rawDescription: "Monthly Rent Payment" },
      { id: "row-3", rawDescription: "Unrelated purchase" },
    ];

    const result = applyCategoryRules(rows, rules);

    expect(result.get("row-1")).toBe("cat-coffee");
    expect(result.get("row-2")).toBe("cat-rent");
    expect(result.get("row-3")).toBeNull();
    expect(result.size).toBe(3);
  });
});
