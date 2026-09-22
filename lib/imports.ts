import type { ImportBatch, ImportRow } from "@prisma/client";
import { db } from "@/lib/db";
import type { ParsedCsvRow } from "@/lib/csv";

export type ImportBatchWithRows = ImportBatch & { rows: ImportRow[] };

/**
 * Creates an ImportBatch + its ImportRows atomically from a caller-supplied
 * parse result (lib/csv.ts's parseCsvRows). Callers MUST pass a householdId
 * sourced from the caller's own session (never client input) — this
 * function re-checks that `accountId` actually belongs to that household
 * before writing anything (the household-scoping guard for this whole
 * flow), since the account id otherwise arrives as a plain form field that
 * could be tampered with. Throws if the account doesn't belong to the
 * household.
 *
 * This is Task 12's own write path: only ImportBatch + ImportRow rows are
 * created here. `categoryId`/`isDuplicate`/`includeInCommit`/
 * `committedTransactionId` are deliberately left at their schema defaults
 * (null / false / true / null) for every row — those fields belong to
 * later tasks (13-15). Nothing is written to Transaction.
 */
export async function createImportBatch(
  householdId: string,
  accountId: string,
  uploadedByUserId: string,
  filename: string,
  rows: ParsedCsvRow[],
): Promise<ImportBatch> {
  const account = await db.account.findFirst({
    where: { id: accountId, householdId },
    select: { id: true },
  });
  if (!account) {
    throw new Error("Invalid account.");
  }

  return db.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: { accountId, filename, uploadedByUserId },
    });

    if (rows.length > 0) {
      await tx.importRow.createMany({
        data: rows.map((row) => ({
          importBatchId: batch.id,
          rowIndex: row.rowIndex,
          rawDate: row.rawDate,
          rawDescription: row.rawDescription,
          rawAmount: row.rawAmount,
          parsedDate: row.parsedDate,
          parsedAmount: row.parsedAmount,
          parseError: row.parseError,
        })),
      });
    }

    return batch;
  });
}

/**
 * Fetches an ImportBatch + its rows (in original CSV order), scoped to the
 * caller's household via the batch's Account relation (ImportBatch has no
 * householdId column of its own — it's linked to a household only through
 * `accountId`, same as the pre-existing Transaction.importBatch relation).
 * Callers MUST pass a householdId sourced from the caller's own session.
 * Returns null if the batch doesn't exist or belongs to another household.
 */
export async function getImportBatch(
  householdId: string,
  batchId: string,
): Promise<ImportBatchWithRows | null> {
  return db.importBatch.findFirst({
    where: { id: batchId, account: { householdId } },
    include: { rows: { orderBy: { rowIndex: "asc" } } },
  });
}
