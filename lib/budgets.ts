import type { BudgetAllocation, BudgetPeriod, BudgetTargetType } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Opens (or creates) the BudgetPeriod for a given household/year/month.
 * Upserts on the `[householdId, year, month]` unique constraint (added in
 * Task 5) so calling this twice for the same month is idempotent — the
 * second call just returns the existing row instead of erroring on a
 * duplicate-key violation.
 *
 * `overallTarget`/`overallTargetType` are deliberately optional and treated
 * as "leave alone" when omitted (`undefined`), vs. "set to this" (including
 * explicit `null`, to clear a previously-set target) when provided. This
 * lets the page call this with no target args just to open/create a period
 * on navigation (e.g. visiting a new month) without ever clobbering a
 * target the user already set, while the overall-target form calls it WITH
 * explicit values (or explicit nulls) to actually change the target.
 *
 * Callers MUST pass a householdId sourced from the caller's own session
 * (never client input) — this function does no authorization check itself.
 */
export async function getOrCreateBudgetPeriod(
  householdId: string,
  year: number,
  month: number,
  overallTarget?: string | null,
  overallTargetType?: BudgetTargetType | null,
): Promise<BudgetPeriod> {
  const targetProvided = overallTarget !== undefined || overallTargetType !== undefined;

  return db.budgetPeriod.upsert({
    where: { householdId_year_month: { householdId, year, month } },
    create: {
      householdId,
      year,
      month,
      overallTarget: overallTarget ?? null,
      overallTargetType: overallTargetType ?? null,
    },
    update: targetProvided
      ? {
          overallTarget: overallTarget ?? null,
          overallTargetType: overallTargetType ?? null,
        }
      : {},
  });
}

/**
 * Sets (creates or updates) the planned amount allocated to a category
 * within a budget period. Always an `upsert` keyed on the
 * `[budgetPeriodId, categoryId]` unique constraint (added this task) —
 * never a plain `create` — so re-allocating a category that already has an
 * allocation in this period updates the existing row instead of creating a
 * duplicate.
 *
 * Verifies that BOTH the budgetPeriod and the category genuinely belong to
 * `householdId` before writing anything — the ids come from a form
 * submission (see app/(app)/budget/actions.ts), and a tampered request
 * could otherwise submit an id belonging to a different household. This
 * mirrors the same real-ownership-check pattern
 * app/(app)/transactions/actions.ts uses for accountId/categoryId.
 */
export async function setAllocation(
  householdId: string,
  budgetPeriodId: string,
  categoryId: string,
  plannedAmount: string,
): Promise<BudgetAllocation> {
  const [period, category] = await Promise.all([
    db.budgetPeriod.findFirst({ where: { id: budgetPeriodId, householdId } }),
    db.category.findFirst({ where: { id: categoryId, householdId } }),
  ]);

  if (!period) {
    throw new Error("Budget period not found.");
  }
  if (!category) {
    throw new Error("Category not found.");
  }

  return db.budgetAllocation.upsert({
    where: { budgetPeriodId_categoryId: { budgetPeriodId, categoryId } },
    create: { budgetPeriodId, categoryId, plannedAmount },
    update: { plannedAmount },
  });
}

/**
 * Lists every allocation in a budget period. Takes only `budgetPeriodId`
 * (no householdId), per this task's brief — callers only ever pass an id
 * that was itself just obtained via `getOrCreateBudgetPeriod(householdId,
 * ...)` in the same request (see app/(app)/budget/page.tsx), so it is
 * already household-verified by the time it reaches here, the same trust
 * boundary `getAllocationsForPeriod`'s callers rely on elsewhere in this
 * codebase (e.g. TransactionForm's category list).
 */
export async function getAllocationsForPeriod(
  budgetPeriodId: string,
): Promise<BudgetAllocation[]> {
  return db.budgetAllocation.findMany({ where: { budgetPeriodId } });
}

/**
 * Copies every allocation from the most recent PRIOR budget period into
 * `targetBudgetPeriodId`, via upsert (so re-running "copy last month" is
 * itself idempotent and never duplicates).
 *
 * "Most recent prior period" means the closest period chronologically
 * before the target period's year/month — NOT literally "the previous
 * calendar month". If the target is January 2026 and no period row exists
 * for December 2025, but one exists for November 2025, this correctly
 * finds November (the `OR` below matches any period with a strictly
 * smaller (year, month) pair, ordered desc so the closest one wins) rather
 * than copying nothing just because December is empty.
 *
 * Both the target period AND the copied-from period are verified to belong
 * to `householdId` before anything is read or written.
 */
export async function copyAllocationsFromPreviousPeriod(
  householdId: string,
  targetBudgetPeriodId: string,
): Promise<BudgetAllocation[]> {
  const targetPeriod = await db.budgetPeriod.findFirst({
    where: { id: targetBudgetPeriodId, householdId },
  });
  if (!targetPeriod) {
    throw new Error("Budget period not found.");
  }

  const previousPeriod = await db.budgetPeriod.findFirst({
    where: {
      householdId,
      OR: [
        { year: { lt: targetPeriod.year } },
        { year: targetPeriod.year, month: { lt: targetPeriod.month } },
      ],
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  if (!previousPeriod) {
    return [];
  }

  const previousAllocations = await db.budgetAllocation.findMany({
    where: { budgetPeriodId: previousPeriod.id },
  });

  return Promise.all(
    previousAllocations.map((allocation) =>
      db.budgetAllocation.upsert({
        where: {
          budgetPeriodId_categoryId: {
            budgetPeriodId: targetBudgetPeriodId,
            categoryId: allocation.categoryId,
          },
        },
        create: {
          budgetPeriodId: targetBudgetPeriodId,
          categoryId: allocation.categoryId,
          plannedAmount: allocation.plannedAmount,
        },
        update: { plannedAmount: allocation.plannedAmount },
      }),
    ),
  );
}
