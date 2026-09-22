import type { BudgetPeriod, BudgetTargetType } from "@prisma/client";
import { db } from "@/lib/db";
import { getAllocationsForPeriod } from "@/lib/budgets";

// This is deliberately a SEPARATE file from lib/budgets.ts (Task 10, plural
// — BudgetPeriod/BudgetAllocation CRUD: getOrCreateBudgetPeriod,
// setAllocation, getAllocationsForPeriod, copyAllocationsFromPreviousPeriod).
// This file (singular) is read-only planned-vs-actual AGGREGATION for the
// dashboard: it reuses lib/budgets.ts's getAllocationsForPeriod rather than
// re-deriving period/allocation lookups, and adds nothing that writes to the
// database. Keeping the boundary at "CRUD for periods/allocations" vs.
// "cross-cutting read that joins allocations with the transaction ledger"
// mirrors how lib/goals.ts (progress aggregation) stays separate from
// lib/categories.ts (category CRUD) rather than folding goal-progress logic
// into the categories module.

/** Per-category planned-vs-actual row for the dashboard. `planned`/`actual`
 * are decimal strings (same convention as Transaction.amount /
 * BudgetAllocation.plannedAmount elsewhere in this codebase). */
export type CategoryBudgetRow = {
  categoryId: string;
  categoryName: string;
  planned: string;
  actual: string;
};

/** Aggregate progress against the period's overall target, present only
 * when the period has one set (BudgetPeriod.overallTarget is non-null). */
export type OverallBudgetProgress = {
  target: string;
  targetType: BudgetTargetType;
  actual: string;
};

export type BudgetDashboard = {
  categories: CategoryBudgetRow[];
  overall: OverallBudgetProgress | null;
};

/** [gte, lt) UTC date range covering the whole calendar month for
 * `year`/`month` (1-12) — same construction as lib/transactions.ts's
 * monthRange, kept local here since that helper isn't exported. */
function periodDateRange(year: number, month: number): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

/**
 * Computes the planned-vs-actual dashboard for a household's budget period.
 *
 * Per the controller ruling this task was given:
 * - Per-category "actual" is a plain SUM(amount) of that category's
 *   transactions dated within the period's year/month — no income/expense
 *   sign-flipping or type-based offsetting, matching the precedent Task 9's
 *   lib/goals.ts already established for goal progress (a plain sum over
 *   matching transactions).
 * - Overall "actual" (compared against `period.overallTarget`, when set) is
 *   a plain SUM(amount) across ALL of the household's transactions dated
 *   within the period's year/month, regardless of category — including any
 *   uncategorized ones. It's computed with its own separate query rather
 *   than by summing the per-category rows, specifically so uncategorized
 *   spending is still counted toward the overall figure even though it has
 *   no category row of its own.
 *
 * Which categories appear: the union of categories that have an allocation
 * in this period OR at least one transaction in this period — NOT every
 * household category (that would pad the dashboard with zero/zero rows for
 * categories untouched this month) and NOT just the intersection (a
 * category with actual spending but no allocation this period is real,
 * unplanned spending the user should see, not hidden data; see this
 * function's test coverage and the task report for the full reasoning).
 * A period with no allocations and no transactions yet simply yields an
 * empty `categories` array — not an error.
 *
 * `period` must already be a household-verified BudgetPeriod row (e.g. the
 * one returned by getOrCreateBudgetPeriod(householdId, ...)) — this
 * function does no additional period-ownership check itself, same trust
 * boundary getAllocationsForPeriod's callers already rely on. Callers MUST
 * still pass a householdId sourced from the caller's own session (never
 * client input); it's used directly to scope both transaction aggregate
 * queries below.
 */
export async function getBudgetDashboard(
  householdId: string,
  period: BudgetPeriod,
): Promise<BudgetDashboard> {
  const dateRange = periodDateRange(period.year, period.month);

  const [allocations, categorySums, overallSum] = await Promise.all([
    getAllocationsForPeriod(period.id),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { householdId, date: dateRange },
      _sum: { amount: true },
    }),
    period.overallTarget !== null
      ? db.transaction.aggregate({
          where: { householdId, date: dateRange },
          _sum: { amount: true },
        })
      : null,
  ]);

  const plannedByCategoryId = new Map(
    allocations.map((allocation) => [
      allocation.categoryId,
      allocation.plannedAmount.toString(),
    ]),
  );

  const actualByCategoryId = new Map<string, string>(
    categorySums
      .filter(
        (sum): sum is typeof sum & { categoryId: string } =>
          sum.categoryId !== null,
      )
      .map((sum) => [sum.categoryId, (sum._sum.amount ?? 0).toString()]),
  );

  const relevantCategoryIds = new Set<string>([
    ...plannedByCategoryId.keys(),
    ...actualByCategoryId.keys(),
  ]);

  const categories =
    relevantCategoryIds.size === 0
      ? []
      : await db.category.findMany({
          where: { householdId, id: { in: [...relevantCategoryIds] } },
          select: { id: true, name: true },
        });
  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  const rows: CategoryBudgetRow[] = [...relevantCategoryIds]
    .map((categoryId) => ({
      categoryId,
      categoryName: categoryNameById.get(categoryId) ?? "Unknown category",
      planned: plannedByCategoryId.get(categoryId) ?? "0",
      actual: actualByCategoryId.get(categoryId) ?? "0",
    }))
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName));

  const overall: OverallBudgetProgress | null =
    period.overallTarget !== null && period.overallTargetType !== null
      ? {
          target: period.overallTarget.toString(),
          targetType: period.overallTargetType,
          actual: (overallSum?._sum.amount ?? 0).toString(),
        }
      : null;

  return { categories: rows, overall };
}
