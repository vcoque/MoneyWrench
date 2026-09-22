import type { BudgetTargetType } from "@prisma/client";

// Pure constants/types only — no `@/lib/db` import here, so this module is
// safe to import from client components (e.g. the overall-target form's
// spend_limit/save_target radio group), same convention as
// lib/account-types.ts and lib/transaction-types.ts.

export const BUDGET_TARGET_TYPES = [
  "spend_limit",
  "save_target",
] as const satisfies readonly BudgetTargetType[];

export const BUDGET_TARGET_TYPE_LABELS: Record<BudgetTargetType, string> = {
  spend_limit: "Spending limit",
  save_target: "Savings target",
};

export function isBudgetTargetType(value: string): value is BudgetTargetType {
  return (BUDGET_TARGET_TYPES as readonly string[]).includes(value);
}
