import type { CategoryKind } from "@prisma/client";

// Pure constants/types only — no `@/lib/db` import here, so this module is
// safe to import from client components, mirroring lib/account-types.ts.

export const CATEGORY_KINDS = [
  "expense",
  "savings_goal",
] as const satisfies readonly CategoryKind[];

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  expense: "Expense",
  savings_goal: "Savings goal",
};

export function isCategoryKind(value: string): value is CategoryKind {
  return (CATEGORY_KINDS as readonly string[]).includes(value);
}
