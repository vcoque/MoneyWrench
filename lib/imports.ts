import type { ImportBatch, ImportRow } from "@prisma/client";
import { db } from "@/lib/db";
import type { ParsedCsvRow } from "@/lib/csv";
import { applyCategoryRules } from "@/lib/categorize";

export type ImportRowWithCategory = ImportRow & {
  category: { id: string; name: string } | null;
};

export type ImportBatchWithRows = ImportBatch & { rows: ImportRowWithCategory[] };

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
 * This is Task 12's write path (ImportBatch + ImportRow rows), extended by
 * Task 13: immediately after the rows are created, the household's current
 * CategoryRules (lib/category-rules.ts) are applied to them in the same
 * transaction (lib/categorize.ts's pure applyCategoryRules), so a newly
 * created batch already reflects current rules rather than requiring a
 * separate manual step. `isDuplicate`/`includeInCommit`/
 * `committedTransactionId` are still left at their schema defaults (false /
 * true / null) for every row — those fields belong to later tasks (14-15).
 * Nothing is written to Transaction.
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
      const createdRows = await tx.importRow.createManyAndReturn({
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
        select: { id: true, rawDescription: true },
      });

      const rules = await tx.categoryRule.findMany({ where: { householdId } });
      if (rules.length > 0) {
        const categorization = applyCategoryRules(createdRows, rules);
        await Promise.all(
          createdRows
            .map((row) => [row.id, categorization.get(row.id) ?? null] as const)
            .filter(([, categoryId]) => categoryId !== null)
            .map(([id, categoryId]) =>
              tx.importRow.update({ where: { id }, data: { categoryId } }),
            ),
        );
      }
    }

    return batch;
  });
}

/**
 * Fetches an ImportBatch + its rows (in original CSV order), scoped to the
 * caller's household via the batch's Account relation (ImportBatch has no
 * householdId column of its own — it's linked to a household only through
 * `accountId`, same as the pre-existing Transaction.importBatch relation).
 * Each row's resolved category (id + name) is joined in, for the preview
 * page to display (Task 13) — null when the row is still uncategorized.
 * Callers MUST pass a householdId sourced from the caller's own session.
 * Returns null if the batch doesn't exist or belongs to another household.
 */
export async function getImportBatch(
  householdId: string,
  batchId: string,
): Promise<ImportBatchWithRows | null> {
  return db.importBatch.findFirst({
    where: { id: batchId, account: { householdId } },
    include: {
      rows: {
        orderBy: { rowIndex: "asc" },
        include: { category: { select: { id: true, name: true } } },
      },
    },
  });
}

/**
 * Re-applies a household's current CategoryRules to every row of an
 * already-staged ImportBatch, overwriting each row's categoryId with the
 * freshly computed result (see lib/categorize.ts's applyCategoryRules for
 * why ALL rows are re-evaluated rather than only null ones). This is what
 * powers the import preview page's "re-apply category rules" action: a
 * user creates a new rule (or edits/deletes one) after a batch already
 * exists, then re-runs categorization on that existing batch.
 *
 * Scoped to the caller's household via the batch's Account relation, same
 * guard as getImportBatch. Callers MUST pass a householdId sourced from the
 * caller's own session. Returns false if the batch doesn't exist or
 * belongs to another household (nothing is written); true otherwise.
 */
export async function applyCategoryRulesToBatch(
  householdId: string,
  batchId: string,
): Promise<boolean> {
  const batch = await db.importBatch.findFirst({
    where: { id: batchId, account: { householdId } },
    select: {
      id: true,
      rows: { select: { id: true, rawDescription: true } },
    },
  });
  if (!batch) {
    return false;
  }

  const rules = await db.categoryRule.findMany({ where: { householdId } });
  const categorization = applyCategoryRules(batch.rows, rules);

  const updates = Array.from(categorization.entries()).map(([id, categoryId]) =>
    db.importRow.update({ where: { id }, data: { categoryId } }),
  );
  if (updates.length > 0) {
    await db.$transaction(updates);
  }

  return true;
}
