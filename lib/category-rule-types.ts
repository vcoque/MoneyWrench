import type { CategoryRuleMatchType } from "@prisma/client";

// Pure constants/types only — no `@/lib/db` import here, so this module is
// safe to import from client components (the rule form's match-type
// <select>), mirroring lib/account-types.ts/lib/category-types.ts.

export const CATEGORY_RULE_MATCH_TYPES = [
  "contains",
  "exact",
  "regex",
] as const satisfies readonly CategoryRuleMatchType[];

export const CATEGORY_RULE_MATCH_TYPE_LABELS: Record<CategoryRuleMatchType, string> = {
  contains: "Contains",
  exact: "Exact match",
  regex: "Regex",
};

export function isCategoryRuleMatchType(
  value: string,
): value is CategoryRuleMatchType {
  return (CATEGORY_RULE_MATCH_TYPES as readonly string[]).includes(value);
}
