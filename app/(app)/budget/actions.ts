"use server";

import { revalidatePath } from "next/cache";
import type { BudgetTargetType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listCategories } from "@/lib/categories";
import {
  copyAllocationsFromPreviousPeriod,
  getOrCreateBudgetPeriod,
  setAllocation,
} from "@/lib/budgets";
import { isBudgetTargetType } from "@/lib/budget-types";

export type BudgetActionState = {
  error?: string;
};

/** Same decimal validation shape used across this codebase (goals,
 * transactions): a non-negative number with up to 2 decimal places, passed
 * through to Prisma's Decimal fields as a string to avoid float rounding
 * issues. Allocations allow 0 (explicitly budgeting nothing to a category
 * this month is meaningful), unlike goal targets/transaction amounts which
 * require a strictly positive value. */
const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;

function parseYearMonth(
  formData: FormData,
): { year: number; month: number } | null {
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }
  return { year, month };
}

/**
 * Creates/opens a BudgetPeriod for a month (idempotent, see
 * getOrCreateBudgetPeriod) and sets its optional overall target in the same
 * submission. Leaving both the amount field blank and no radio selected
 * clears any previously-set target; entering an amount requires picking a
 * type (spend_limit/save_target), since a bare number without a type is
 * ambiguous.
 */
export async function setOverallTargetAction(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route, but never
  // trust a client-supplied householdId — read it from the server session.
  if (!session?.householdId) {
    return { error: "You must be logged in to set a budget target." };
  }

  const period = parseYearMonth(formData);
  if (!period) {
    return { error: "Invalid month." };
  }

  const amountRaw = String(formData.get("overallTarget") ?? "").trim();
  const typeRaw = String(formData.get("overallTargetType") ?? "").trim();

  let overallTarget: string | null;
  let overallTargetType: BudgetTargetType | null;

  if (amountRaw === "" && typeRaw === "") {
    overallTarget = null;
    overallTargetType = null;
  } else {
    if (!DECIMAL_RE.test(amountRaw) || Number(amountRaw) <= 0) {
      return {
        error: "Target amount must be a positive number (up to 2 decimals).",
      };
    }
    if (!isBudgetTargetType(typeRaw)) {
      return {
        error: "Select whether this is a spending limit or a savings target.",
      };
    }
    overallTarget = amountRaw;
    overallTargetType = typeRaw;
  }

  await getOrCreateBudgetPeriod(
    session.householdId,
    period.year,
    period.month,
    overallTarget,
    overallTargetType,
  );

  revalidatePath("/budget");
  return {};
}

/**
 * Saves per-category planned amounts for a budget period. Re-derives the
 * household's own categories via listCategories (never trusts client-
 * supplied category ids beyond matching one of these), and skips any
 * category whose amount field was left blank — leaving an already-set
 * allocation untouched rather than deleting it, since "delete an
 * allocation" isn't in this task's scope.
 *
 * Two-pass, all-or-nothing: first every non-blank amount field is validated
 * (no writes yet), and only if ALL of them pass does the second pass write
 * them — inside a single db.$transaction, so a write-time failure partway
 * through the batch (e.g. setAllocation's ownership check rejecting a
 * category that was deleted out from under the request) rolls back
 * everything already written in THIS submission too. Previously this wrote
 * inside the validation loop itself, so an invalid field later in the form
 * could leave earlier, valid categories already persisted while the
 * request as a whole reported an error — a partial, field-order-dependent
 * write. Each write still goes through setAllocation, which upserts on the
 * (budgetPeriodId, categoryId) unique constraint AND re-verifies both ids
 * belong to this household — see lib/budgets.ts.
 */
export async function saveAllocationsAction(
  _prevState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const session = await auth();
  if (!session?.householdId) {
    return { error: "You must be logged in to allocate a budget." };
  }

  const budgetPeriodId = String(formData.get("budgetPeriodId") ?? "");
  if (!budgetPeriodId) {
    return { error: "Missing budget period." };
  }

  const categories = await listCategories(session.householdId);

  // Pass 1: validate every non-blank amount. No writes happen here.
  const entries: { categoryId: string; amount: string }[] = [];
  for (const category of categories) {
    const raw = String(formData.get(`amount-${category.id}`) ?? "").trim();
    if (raw === "") {
      continue;
    }
    if (!DECIMAL_RE.test(raw)) {
      return {
        error: `Amount for "${category.name}" must be a non-negative number (up to 2 decimals).`,
      };
    }
    entries.push({ categoryId: category.id, amount: raw });
  }

  // Pass 2: write the whole validated batch atomically. If anything fails
  // here (e.g. a race with the category/period being removed concurrently),
  // the transaction rolls back and NONE of this submission's allocations
  // are persisted — not just the ones after the failing entry.
  const householdId = session.householdId;
  try {
    await db.$transaction(async (tx) => {
      for (const entry of entries) {
        await setAllocation(householdId, budgetPeriodId, entry.categoryId, entry.amount, tx);
      }
    });
  } catch {
    return { error: "Could not save allocations. Please try again." };
  }

  revalidatePath("/budget");
  return {};
}

/**
 * Plain (non-useActionState) server action for the "Copy last month"
 * button — mirrors deleteTransactionAction's shape (no pending/error UI
 * needed beyond the page refreshing with the copied-in amounts).
 */
export async function copyLastMonthAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.householdId) {
    return;
  }

  const budgetPeriodId = String(formData.get("budgetPeriodId") ?? "");
  if (!budgetPeriodId) {
    return;
  }

  await copyAllocationsFromPreviousPeriod(session.householdId, budgetPeriodId);
  revalidatePath("/budget");
}
