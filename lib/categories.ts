import type { Category, CategoryKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Either the shared `db` singleton or a Prisma interactive-transaction
 * client (`tx` from `db.$transaction(async (tx) => ...)`). Letting
 * createCategory accept either means callers that need the category insert
 * to participate in a larger atomic transaction (e.g. Task 9's
 * createGoal, which must create a SavingsGoal and its linked Category
 * together-or-not-at-all) can pass `tx`, while everyone else keeps calling
 * this with no 5th argument at all. */
type DbClient = typeof db | Prisma.TransactionClient;

/**
 * Lists non-archived categories for a household, newest first. Callers MUST
 * pass a householdId sourced from the caller's own session (never client
 * input) — this function does no authorization check itself.
 */
export async function listCategories(householdId: string): Promise<Category[]> {
  return db.category.findMany({
    where: { householdId, isArchived: false },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Creates a category in the given household. Callers MUST pass a
 * householdId sourced from the caller's own session (never client input).
 *
 * Accepts `kind` and an optional `savingsGoalId` rather than hardcoding
 * `kind: "expense"` — this task's own UI (app/(app)/categories) only ever
 * calls this with kind "expense" and no savingsGoalId, but Task 9
 * (SavingsGoal creation) needs to create the linked `savings_goal`-kind
 * category for a goal via this same function, passing kind "savings_goal"
 * and that goal's id, without duplicating category-insert logic.
 *
 * The optional `client` (defaulting to the shared `db` singleton) lets
 * Task 9's createGoal pass its transaction's `tx` client instead, so this
 * insert participates in that atomic create-goal-and-category transaction
 * rather than running against a separate, unrelated connection.
 */
export async function createCategory(
  householdId: string,
  name: string,
  kind: CategoryKind,
  savingsGoalId?: string,
  client: DbClient = db,
): Promise<Category> {
  return client.category.create({
    data: { householdId, name, kind, savingsGoalId },
  });
}

/**
 * Archives a category by flagging it rather than deleting the row, so
 * Transaction/BudgetAllocation/CategoryRule history referencing it stays
 * intact. Scoped by householdId in the `where` clause itself — an
 * `updateMany` with both `id` and `householdId` conditions is the actual
 * cross-household guard: if the category belongs to a different household,
 * zero rows match and nothing is archived. Returns whether a category was
 * actually archived.
 */
export async function archiveCategory(
  householdId: string,
  categoryId: string,
): Promise<boolean> {
  const result = await db.category.updateMany({
    where: { id: categoryId, householdId },
    data: { isArchived: true },
  });
  return result.count === 1;
}
