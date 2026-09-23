import type { CategoryRule, CategoryRuleMatchType } from "@prisma/client";
import { db } from "@/lib/db";

export type CategoryRuleInput = {
  matchType: CategoryRuleMatchType;
  pattern: string;
  categoryId: string;
  priority: number;
};

/** A rule plus its category's name, for list rendering without a second
 * lookup — joins even an archived category's name, since deleting a
 * category never removes rules that reference it (Category is
 * archive-only, never hard-deleted), and a rule pointing at an archived
 * category should still show a real name rather than "Unknown". */
export type CategoryRuleWithCategory = CategoryRule & {
  category: { id: string; name: string };
};

/**
 * Lists a household's category rules ordered by priority ascending (lower
 * number = evaluated first, per the controller ruling), then by creation
 * order as a tie-break. Callers MUST pass a householdId sourced from the
 * caller's own session (never client input) — this function does no
 * authorization check itself.
 */
export async function listCategoryRules(
  householdId: string,
): Promise<CategoryRuleWithCategory[]> {
  return db.categoryRule.findMany({
    where: { householdId },
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Creates a category rule in the given household. Callers MUST pass a
 * householdId sourced from the caller's own session (never client input).
 */
export async function createCategoryRule(
  householdId: string,
  input: CategoryRuleInput,
): Promise<CategoryRule> {
  return db.categoryRule.create({
    data: { householdId, ...input },
  });
}

/**
 * Updates a category rule's fields. Scoped by householdId in the `where`
 * clause itself — an `updateMany` with both `id` and `householdId`
 * conditions is the actual cross-household guard: a rule belonging to a
 * different household matches zero rows and is left untouched. Returns
 * whether a rule was actually updated.
 */
export async function updateCategoryRule(
  householdId: string,
  ruleId: string,
  input: CategoryRuleInput,
): Promise<boolean> {
  const result = await db.categoryRule.updateMany({
    where: { id: ruleId, householdId },
    data: input,
  });
  return result.count === 1;
}

/**
 * Hard-deletes a category rule. Unlike Account/Category, nothing
 * references a CategoryRule as a foreign key, so there's no history to
 * preserve by archiving instead (same reasoning as Task 8's
 * deleteTransaction). Scoped by householdId in the `where` clause itself,
 * same guard shape as updateCategoryRule. Returns whether a rule was
 * actually deleted.
 */
export async function deleteCategoryRule(
  householdId: string,
  ruleId: string,
): Promise<boolean> {
  const result = await db.categoryRule.deleteMany({
    where: { id: ruleId, householdId },
  });
  return result.count === 1;
}
