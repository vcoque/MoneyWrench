import type { AccountType } from "@prisma/client";

// Pure constants/types only — no `@/lib/db` import here, so this module is
// safe to import from client components (e.g. the account creation form's
// type <select>), unlike lib/accounts.ts which pulls in PrismaClient.

export const ACCOUNT_TYPES = [
  "checking",
  "credit_card",
  "savings",
  "cash",
] as const satisfies readonly AccountType[];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  credit_card: "Credit Card",
  savings: "Savings",
  cash: "Cash",
};

export function isAccountType(value: string): value is AccountType {
  return (ACCOUNT_TYPES as readonly string[]).includes(value);
}
