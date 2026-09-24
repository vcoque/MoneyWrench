import { Prisma, type TransactionType } from "@prisma/client";

/**
 * Pure duplicate-detection logic (Task 15). No `@/lib/db` import — callers
 * fetch the household's existing Transactions for the account being
 * imported into themselves and pass plain data in, same as
 * lib/categorize.ts's rule matching, which is what makes findDuplicateRowIds
 * unit-testable with in-memory fixtures instead of a live Postgres
 * connection.
 */

/** The subset of ImportRow fields duplicate detection needs. */
export type RowForDuplicateCheck = {
  id: string;
  parsedDate: Date | null;
  /** Signed decimal string (e.g. "-42.50"), same convention as ParsedCsvRow/ImportRow.parsedAmount. */
  parsedAmount: string | null;
  rawDescription: string;
};

/** The subset of Transaction fields duplicate detection needs. */
export type TransactionForDuplicateCheck = {
  date: Date;
  amount: Prisma.Decimal | string;
  type: TransactionType;
  description: string;
};

/**
 * Returns whether `signedAmount` (e.g. "-42.50", ImportRow's convention:
 * negative = money out) represents the same money movement as an existing
 * Transaction's unsigned `amount` + `type` — the same sign-to-type
 * derivation lib/imports.ts's commitImportBatch uses when actually creating
 * a Transaction from a row. Compared via Prisma.Decimal rather than string
 * equality so "4.50" and "4.5" (differing only in trailing-zero
 * formatting) still count as the same amount.
 */
function amountsMatch(
  signedAmount: string,
  amount: Prisma.Decimal | string,
  type: TransactionType,
): boolean {
  const negative = signedAmount.startsWith("-");
  const expectedType: TransactionType = negative ? "expense" : "income";
  if (expectedType !== type) {
    return false;
  }
  const unsigned = negative ? signedAmount.slice(1) : signedAmount;
  return new Prisma.Decimal(unsigned).equals(new Prisma.Decimal(amount));
}

/**
 * Returns the ids of every row in `rows` that looks like a duplicate of an
 * existing Transaction — a match on date + amount + description, the
 * "same account + date + amount + description" rule from the design spec.
 * `existingTransactions` MUST already be scoped by the caller to the single
 * account being imported into (and the caller's household); this function
 * does no scoping of its own, same as lib/categorize.ts's pure functions.
 *
 * A row with no parsed date/amount (a parse error) can never match
 * anything and is skipped — those rows are already excluded from commit by
 * their own parseError, independent of duplicate status.
 */
export function findDuplicateRowIds(
  rows: RowForDuplicateCheck[],
  existingTransactions: TransactionForDuplicateCheck[],
): Set<string> {
  const duplicateIds = new Set<string>();

  for (const row of rows) {
    if (row.parsedDate === null || row.parsedAmount === null) {
      continue;
    }

    const parsedDate = row.parsedDate;
    const parsedAmount = row.parsedAmount;
    const isDuplicate = existingTransactions.some(
      (tx) =>
        tx.date.getTime() === parsedDate.getTime() &&
        tx.description === row.rawDescription &&
        amountsMatch(parsedAmount, tx.amount, tx.type),
    );

    if (isDuplicate) {
      duplicateIds.add(row.id);
    }
  }

  return duplicateIds;
}
