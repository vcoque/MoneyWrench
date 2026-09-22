import { Prisma } from "@prisma/client";
import type { Transaction, TransactionType } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * A transaction with just enough of its related account/category attached
 * for list rendering (name only) — not the full related rows.
 */
export type TransactionWithRelations = Transaction & {
  account: { id: string; name: string };
  category: { id: string; name: string } | null;
};

export type TransactionFilters = {
  accountId?: string;
  categoryId?: string;
  /** "YYYY-MM" — matches the native <input type="month"> value format. */
  month?: string;
};

export type TransactionInput = {
  accountId: string;
  categoryId: string | null;
  date: Date;
  /** Decimal amount as a string (e.g. "42.50") — passed straight through to
   * Prisma's Decimal field, avoiding float rounding issues. */
  amount: string;
  type: TransactionType;
  description: string;
};

/** Parses a "YYYY-MM" filter value into a [gte, lt) date range, or null if malformed. */
function monthRange(month: string): { gte: Date; lt: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  return {
    gte: new Date(Date.UTC(year, monthIndex, 1)),
    lt: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

/**
 * Lists a household's transactions, newest first, optionally filtered by
 * account, category, and/or month. Callers MUST pass a householdId sourced
 * from the caller's own session (never client input) — this function does
 * no authorization check itself.
 */
export async function listTransactions(
  householdId: string,
  filters: TransactionFilters = {},
): Promise<TransactionWithRelations[]> {
  const where: Prisma.TransactionWhereInput = { householdId };

  if (filters.accountId) {
    where.accountId = filters.accountId;
  }
  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }
  if (filters.month) {
    const range = monthRange(filters.month);
    if (range) {
      where.date = range;
    }
  }

  return db.transaction.findMany({
    where,
    include: {
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });
}

/**
 * Creates a manual transaction in the given household. Callers MUST pass a
 * householdId and createdByUserId sourced from the caller's own session
 * (never client input). `source` is always "manual" here — imported
 * transactions are created by a separate future flow (Task 12+), never
 * through this function.
 */
export async function createTransaction(
  householdId: string,
  createdByUserId: string,
  input: TransactionInput,
): Promise<Transaction> {
  return db.transaction.create({
    data: {
      householdId,
      accountId: input.accountId,
      categoryId: input.categoryId,
      date: input.date,
      amount: input.amount,
      type: input.type,
      description: input.description,
      source: "manual",
      createdByUserId,
    },
  });
}

/**
 * Updates a transaction's fields. Scoped by householdId AND
 * `source: "manual"` in the `where` clause itself — an `updateMany` with
 * id, householdId, and source conditions is the actual guard: a
 * transaction belonging to a different household, or one created by a
 * future import flow (source: "import"), matches zero rows and is left
 * untouched. Returns whether a transaction was actually updated.
 */
export async function updateTransaction(
  householdId: string,
  transactionId: string,
  input: TransactionInput,
): Promise<boolean> {
  const result = await db.transaction.updateMany({
    where: { id: transactionId, householdId, source: "manual" },
    data: {
      accountId: input.accountId,
      categoryId: input.categoryId,
      date: input.date,
      amount: input.amount,
      type: input.type,
      description: input.description,
    },
  });
  return result.count === 1;
}

/**
 * Hard-deletes a transaction. Unlike Account/Category, nothing references a
 * Transaction as a foreign key (see Task 8's controller ruling), so this is
 * a real DELETE rather than an archive flag. Scoped by householdId AND
 * `source: "manual"` in the `where` clause itself, same guard shape as
 * updateTransaction. Returns whether a transaction was actually deleted.
 */
export async function deleteTransaction(
  householdId: string,
  transactionId: string,
): Promise<boolean> {
  const result = await db.transaction.deleteMany({
    where: { id: transactionId, householdId, source: "manual" },
  });
  return result.count === 1;
}
