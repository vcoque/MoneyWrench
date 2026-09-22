import type { SavingsGoal } from "@prisma/client";
import { db } from "@/lib/db";
import { createCategory } from "@/lib/categories";

/**
 * A savings goal plus its computed progress. `progress` is a decimal string
 * (same convention as Transaction.amount / SavingsGoal.targetAmount
 * elsewhere in this codebase) — the all-time sum of every transaction's
 * amount in this goal's linked category. There is deliberately no stored
 * progress/currentAmount column on SavingsGoal (per the schema); this is
 * always recomputed at read time, never cached.
 */
export type GoalWithProgress = Pick<
  SavingsGoal,
  "id" | "householdId" | "name" | "targetAmount" | "createdAt" | "updatedAt"
> & {
  categoryId: string;
  progress: string;
};

/**
 * Creates a SavingsGoal and its linked `savings_goal`-kind Category
 * together, atomically. Category.savingsGoalId is a foreign key
 * referencing SavingsGoal.id, so the goal row must exist before the
 * category can be created — both inserts run inside one db.$transaction so
 * a goal is never left without its category, or vice versa, if either
 * insert fails partway.
 *
 * Reuses Task 7's createCategory (lib/categories.ts) instead of
 * duplicating category-insert logic, exactly as that function's own doc
 * comment anticipated. createCategory accepts an optional Prisma client as
 * its last argument (defaulting to the shared `db` singleton) specifically
 * so it can run against this transaction's client (`tx`) rather than
 * opening a second, unrelated connection outside the transaction.
 *
 * Callers MUST pass a householdId sourced from the caller's own session
 * (never client input) — this function does no authorization check itself.
 */
export async function createGoal(
  householdId: string,
  name: string,
  targetAmount: string,
): Promise<SavingsGoal> {
  return db.$transaction(async (tx) => {
    const goal = await tx.savingsGoal.create({
      data: { householdId, name, targetAmount },
    });
    // Same name as the goal, kind "savings_goal", linked back via
    // savingsGoalId — this is the exact call shape tests/categories.test.ts
    // already proved works.
    await createCategory(householdId, name, "savings_goal", goal.id, tx);
    return goal;
  });
}

/**
 * Lists a household's savings goals, newest first, each with its computed
 * progress: the all-time sum of `amount` across every transaction posted to
 * the goal's linked category. Per the design spec's Key Flows,
 * contributing to a goal ("Vacation Fund") IS an ordinary Transaction in
 * that goal's category — there is no separate contribution ledger, no
 * income/withdrawal offsetting, and no period scoping — so a plain sum over
 * matching transactions is the correct, complete computation. Nothing here
 * is cached: every call re-runs the sum against current data.
 *
 * Uses a single groupBy over all of the household's goal-linked category
 * ids, rather than one aggregate query per goal, to avoid N+1 queries.
 *
 * Callers MUST pass a householdId sourced from the caller's own session
 * (never client input) — this function does no authorization check itself.
 */
export async function listGoalsWithProgress(
  householdId: string,
): Promise<GoalWithProgress[]> {
  const goals = await db.savingsGoal.findMany({
    where: { householdId },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });

  const categoryIds = goals
    .map((goal) => goal.category?.id)
    .filter((id): id is string => Boolean(id));

  const sums =
    categoryIds.length === 0
      ? []
      : await db.transaction.groupBy({
          by: ["categoryId"],
          where: { categoryId: { in: categoryIds } },
          _sum: { amount: true },
        });

  const progressByCategoryId = new Map<string, string>(
    sums.map((sum) => [
      // Safe: the where clause above only matches rows whose categoryId is
      // one of `categoryIds` (all non-null strings), even though the
      // Transaction.categoryId column itself is nullable.
      sum.categoryId as string,
      (sum._sum.amount ?? 0).toString(),
    ]),
  );

  return goals.map((goal) => {
    const categoryId = goal.category?.id ?? "";
    return {
      id: goal.id,
      householdId: goal.householdId,
      name: goal.name,
      targetAmount: goal.targetAmount,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      categoryId,
      progress: progressByCategoryId.get(categoryId) ?? "0",
    };
  });
}
