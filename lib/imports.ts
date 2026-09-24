import type { ImportBatch, ImportRow, TransactionType } from "@prisma/client";
import { db } from "@/lib/db";
import type { ParsedCsvRow } from "@/lib/csv";
import { applyCategoryRules } from "@/lib/categorize";
import { findDuplicateRowIds } from "@/lib/duplicates";

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
 * separate manual step. Further extended by Task 15: each row is also
 * checked against the account's existing Transactions (lib/duplicates.ts's
 * pure findDuplicateRowIds) — a match flags `isDuplicate: true` and flips
 * `includeInCommit` to false, so a likely duplicate is excluded from commit
 * by default; the review UI's existing per-row include/skip toggle (Task
 * 14) is what lets a user override that and include it anyway.
 * `committedTransactionId` is still left at its schema default (null) for
 * every row — that's only ever set by commitImportBatch. Nothing is
 * written to Transaction.
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
        select: { id: true, rawDescription: true, parsedDate: true, parsedAmount: true },
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

      // Task 15: flag likely duplicates against this account's existing
      // Transactions. `existingTransactions` is intentionally scoped to
      // `accountId` alone (not also `householdId`) — accountId was already
      // verified above to belong to this household, and Account has no
      // other household's rows to leak.
      const existingTransactions = await tx.transaction.findMany({
        where: { accountId },
        select: { date: true, amount: true, type: true, description: true },
      });
      const duplicateIds = findDuplicateRowIds(
        createdRows.map((row) => ({
          id: row.id,
          parsedDate: row.parsedDate,
          parsedAmount: row.parsedAmount?.toString() ?? null,
          rawDescription: row.rawDescription,
        })),
        existingTransactions,
      );
      if (duplicateIds.size > 0) {
        await tx.importRow.updateMany({
          where: { id: { in: Array.from(duplicateIds) } },
          data: { isDuplicate: true, includeInCommit: false },
        });
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
 *
 * Task 14 addition: rows the user has manually corrected
 * (`categorySource: "manual"`, set by updateImportRowCategory below) are
 * excluded from re-evaluation entirely — they're left out of the batch
 * passed to applyCategoryRules, so they never appear in its result map and
 * are never written to. Without this, a user's manual correction would get
 * silently clobbered by anyone (re-)clicking "Re-apply category rules"
 * after the fact.
 */
export async function applyCategoryRulesToBatch(
  householdId: string,
  batchId: string,
): Promise<boolean> {
  const batch = await db.importBatch.findFirst({
    where: { id: batchId, account: { householdId } },
    select: {
      id: true,
      rows: { select: { id: true, rawDescription: true, categorySource: true } },
    },
  });
  if (!batch) {
    return false;
  }

  const rules = await db.categoryRule.findMany({ where: { householdId } });
  const autoRows = batch.rows.filter((row) => row.categorySource !== "manual");
  const categorization = applyCategoryRules(autoRows, rules);

  const updates = Array.from(categorization.entries()).map(([id, categoryId]) =>
    db.importRow.update({ where: { id }, data: { categoryId } }),
  );
  if (updates.length > 0) {
    await db.$transaction(updates);
  }

  return true;
}

/**
 * Applies a user's manual category correction to a single staged row (Task
 * 14's review UI), flipping `categorySource` to "manual" so a later
 * "re-apply category rules" run (see applyCategoryRulesToBatch above) never
 * overwrites it. `categoryId` may be null (uncategorizing a row is allowed,
 * same as manual transaction entry).
 *
 * Scoped to the caller's household via the row's ImportBatch -> Account
 * relation in the `updateMany` `where` clause itself — the real
 * cross-household guard, since ImportRow has no householdId column of its
 * own (same shape as getImportBatch/applyCategoryRulesToBatch). When
 * `categoryId` is non-null, it's also independently re-validated as
 * belonging to this household before anything is written — the category
 * <select>'s options only ever list the household's own categories, but a
 * tampered request could submit an arbitrary id, mirroring
 * parseTransactionForm's category check.
 *
 * Returns the updated row (so callers like the "save correction as a rule"
 * action can read its rawDescription without a second query), or null if
 * the row doesn't exist, belongs to another household, or the given
 * categoryId is invalid.
 */
export async function updateImportRowCategory(
  householdId: string,
  rowId: string,
  categoryId: string | null,
): Promise<ImportRow | null> {
  if (categoryId !== null) {
    const category = await db.category.findFirst({
      where: { id: categoryId, householdId },
      select: { id: true },
    });
    if (!category) {
      return null;
    }
  }

  const result = await db.importRow.updateMany({
    where: { id: rowId, importBatch: { account: { householdId } } },
    data: { categoryId, categorySource: "manual" },
  });
  if (result.count !== 1) {
    return null;
  }

  return db.importRow.findUnique({ where: { id: rowId } });
}

/**
 * Toggles a single staged row's `includeInCommit` flag (Task 14's per-row
 * "skip this row" control) — the "explicitly skipped" mechanism referenced
 * by this task's AC ("excluding any explicitly skipped" row from commit).
 * Scoped to the caller's household the same way as updateImportRowCategory.
 *
 * Also guarded by `parseError: null` in the `where` clause itself: a row
 * with a parse error can never produce a valid Transaction (it lacks a
 * parsed date/amount) regardless of this flag, so it's "blocked" rather
 * than "skippable" (a distinct state per the controller ruling) and this
 * function refuses to touch it — defense in depth alongside the review UI
 * not rendering the toggle for such rows at all.
 *
 * Returns whether a row was actually updated.
 */
export async function setImportRowIncludeInCommit(
  householdId: string,
  rowId: string,
  includeInCommit: boolean,
): Promise<boolean> {
  const result = await db.importRow.updateMany({
    where: {
      id: rowId,
      importBatch: { account: { householdId } },
      parseError: null,
    },
    data: { includeInCommit },
  });
  return result.count === 1;
}

/** Thrown internally by commitImportBatch to force a transaction rollback
 * (see below) — never leaks past this module; commitImportBatch always
 * catches it and turns it into a `{ ok: false, error }` result. */
class ImportBatchCommitError extends Error {}

export type CommitImportBatchResult =
  | { ok: true; transactionCount: number }
  | { ok: false; error: string };

/**
 * Commits a staged ImportBatch to real Transaction rows (Task 14's final
 * step). For every row where `includeInCommit === true` AND
 * `parseError IS NULL` (uncategorized rows are allowed through — a null
 * categoryId is a valid Transaction.categoryId by design, same as manual
 * entry), creates one Transaction with `source: "import"` and links it back
 * via `importBatchId` + `Transaction.categoryId`/`date`/`description` taken
 * from the row, then stamps that row's `committedTransactionId`. Finally
 * flags the batch `committed: true`.
 *
 * `ImportRow.parsedAmount` is a signed decimal (see lib/csv.ts's
 * parseAmountValue — bank-export convention: negative = money out,
 * non-negative = money in), whereas Transaction stores an always-positive
 * `amount` plus a separate `type` (expense/income), same convention
 * lib/transactions.ts already uses for manual entry. This function derives
 * `type` from parsedAmount's sign and stores its absolute value, working on
 * the string representation directly (not Decimal arithmetic) to stay
 * consistent with the rest of this codebase's "amounts are decimal strings"
 * convention.
 *
 * Atomicity / no-double-commit guard: everything (every Transaction create,
 * every row's committedTransactionId stamp, and the batch's committed flag)
 * happens inside one db.$transaction. The batch is first looked up scoped
 * by `{ id, account: { householdId }, committed: false }` — a batch that's
 * already committed (or doesn't belong to this household, or doesn't exist)
 * fails this lookup and nothing is written. The batch is flagged committed
 * at the END via an `updateMany` re-checking `committed: false`; if two
 * commits race, Postgres's default READ COMMITTED behavior re-evaluates
 * that WHERE clause against the row's latest state after acquiring its
 * lock, so only the first transaction to reach this point actually flips
 * the flag (`count === 1`) — the second one's `count` comes back 0, which
 * this function treats as a hard failure and throws to roll back its own
 * Transaction creates too. Net effect: a genuine race never leaves
 * duplicate Transactions behind, even though both transactions' bodies ran
 * to completion.
 *
 * Callers MUST pass a householdId sourced from the caller's own session, and
 * a createdByUserId identifying whoever clicked "Commit" (Transaction's
 * schema requires a non-null createdByUserId; there is no "system" user).
 */
export async function commitImportBatch(
  householdId: string,
  batchId: string,
  createdByUserId: string,
): Promise<CommitImportBatchResult> {
  try {
    const transactionCount = await db.$transaction(async (tx) => {
      const batch = await tx.importBatch.findFirst({
        where: { id: batchId, account: { householdId }, committed: false },
        select: {
          id: true,
          accountId: true,
          rows: {
            where: { includeInCommit: true, parseError: null },
            select: {
              id: true,
              categoryId: true,
              parsedDate: true,
              parsedAmount: true,
              rawDescription: true,
            },
          },
        },
      });
      if (!batch) {
        throw new ImportBatchCommitError(
          "Import batch not found, belongs to another household, or was already committed.",
        );
      }

      for (const row of batch.rows) {
        // Guaranteed non-null: the query above filters parseError: null,
        // and parseCsvRows never leaves parsedDate/parsedAmount null
        // without also setting parseError (see lib/csv.ts).
        const signedAmount = row.parsedAmount!.toString();
        const negative = signedAmount.startsWith("-");
        const amount = negative ? signedAmount.slice(1) : signedAmount;
        const type: TransactionType = negative ? "expense" : "income";

        const created = await tx.transaction.create({
          data: {
            householdId,
            accountId: batch.accountId,
            categoryId: row.categoryId,
            date: row.parsedDate!,
            amount,
            type,
            description: row.rawDescription,
            source: "import",
            importBatchId: batch.id,
            createdByUserId,
          },
        });

        await tx.importRow.update({
          where: { id: row.id },
          data: { committedTransactionId: created.id },
        });
      }

      const flagged = await tx.importBatch.updateMany({
        where: { id: batch.id, committed: false },
        data: { committed: true },
      });
      if (flagged.count !== 1) {
        throw new ImportBatchCommitError(
          "This batch was committed concurrently by another request.",
        );
      }

      return batch.rows.length;
    });

    return { ok: true, transactionCount };
  } catch (error) {
    if (error instanceof ImportBatchCommitError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
