import type { TransactionType } from "@prisma/client";

// Pure constants/types only — no `@/lib/db` import here, so this module is
// safe to import from client components (e.g. TransactionForm's type
// <select>), unlike lib/transactions.ts which pulls in PrismaClient. Mirrors
// lib/account-types.ts / lib/category-types.ts.

export const TRANSACTION_TYPES = [
  "expense",
  "income",
] as const satisfies readonly TransactionType[];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
};

export function isTransactionType(value: string): value is TransactionType {
  return (TRANSACTION_TYPES as readonly string[]).includes(value);
}
