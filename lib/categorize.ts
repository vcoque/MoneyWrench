import type { CategoryRule } from "@prisma/client";

/**
 * Pure category-rule matching logic (Task 13). Deliberately no `@/lib/db`
 * import here — callers fetch rules/rows themselves and pass plain data in,
 * which is what makes matchCategoryForRow/applyCategoryRules unit-testable
 * with in-memory fixtures instead of a live Postgres connection.
 */

/** The subset of CategoryRule fields matching actually needs. */
export type RuleForMatching = Pick<
  CategoryRule,
  "matchType" | "pattern" | "categoryId" | "priority"
>;

/** The subset of ImportRow fields applyCategoryRules actually needs. */
export type RowForCategorization = {
  id: string;
  rawDescription: string;
};

/**
 * Returns whether a single rule matches a row's description. Controller
 * rulings baked in here:
 *   - matching is against the raw description as given (callers pass
 *     ImportRow.rawDescription, the verbatim CSV text — never a
 *     parsed/cleaned value).
 *   - "contains" and "exact" match case-insensitively (bank CSV casing is
 *     inconsistent).
 *   - "regex" patterns are tested with `new RegExp(pattern, "i")` — also
 *     case-insensitive, for consistency with the other two match types. A
 *     malformed pattern (invalid regex syntax) is treated as a non-match
 *     rather than thrown, so one bad rule can't crash categorization for an
 *     entire batch.
 */
function ruleMatches(description: string, rule: RuleForMatching): boolean {
  switch (rule.matchType) {
    case "contains":
      return description.toLowerCase().includes(rule.pattern.toLowerCase());
    case "exact":
      return description.toLowerCase() === rule.pattern.toLowerCase();
    case "regex":
      try {
        return new RegExp(rule.pattern, "i").test(description);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Returns the categoryId of the first rule (by priority) that matches
 * `description`, or null if none do.
 *
 * Priority convention (controller ruling): LOWER priority number is
 * evaluated FIRST and wins on first match — priority 1 beats priority 10.
 * Callers may pass `rules` in any order; this function sorts its own
 * working copy ascending by priority before evaluating, so correctness
 * doesn't depend on the order the caller fetched rules in. Ties (equal
 * priority) keep the relative order rules were passed in (stable sort) —
 * nothing in the brief specifies tie-break behavior beyond that.
 *
 * No DB calls — pure and independently testable.
 */
export function matchCategoryForRow(
  description: string,
  rules: RuleForMatching[],
): string | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (ruleMatches(description, rule)) {
      return rule.categoryId;
    }
  }
  return null;
}

/**
 * Applies a household's category rules to a batch of staged import rows,
 * returning the resolved categoryId (or null) for each row id as a Map.
 * Pure/testable — no DB calls; callers (lib/imports.ts) are responsible for
 * writing the result back.
 *
 * Design choice: every row is re-evaluated against the given rule set,
 * rather than only rows that are still uncategorized. Task 13 gives users
 * no way to manually set an ImportRow's category (that's a later task per
 * the dispatch's Discipline note), so the only source of a row's
 * categoryId is this auto-categorization pass — re-evaluating all rows
 * means editing/deleting a rule and re-applying produces the result a user
 * would expect, including reverting a row to uncategorized if the rule
 * that used to match it no longer does. This is exactly the ruling under
 * which lib/imports.ts wires this in (both on batch creation and via the
 * "re-apply" action on an existing batch).
 */
export function applyCategoryRules(
  rows: RowForCategorization[],
  rules: RuleForMatching[],
): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const row of rows) {
    result.set(row.id, matchCategoryForRow(row.rawDescription, rules));
  }
  return result;
}
