"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { createCategoryRule } from "@/lib/category-rules";
import { previewCsv, parseCsvRows, type ColumnMapping } from "@/lib/csv";
import {
  applyCategoryRulesToBatch,
  commitImportBatch,
  createImportBatch,
  setImportRowIncludeInCommit,
  updateImportRowCategory,
} from "@/lib/imports";

/**
 * Step 1 -> step 2 state. "upload" is the initial/error state (still
 * showing the account+file form); "mapping" is returned once the file has
 * been read and its header row is known, carrying the FULL CSV text back to
 * the client so the column-mapping step's submit doesn't require
 * re-reading the file — the browser just resubmits it as a hidden field.
 * Keeping the raw CSV text out of any DB write until the mapping step is
 * confirmed matches this task's AC: nothing is staged until the user has
 * mapped columns.
 */
export type AnalyzeCsvState =
  | { step: "upload"; error?: string }
  | {
      step: "mapping";
      accountId: string;
      filename: string;
      csvText: string;
      headers: string[];
      sampleRows: string[][];
    };

export async function analyzeCsvAction(
  _prevState: AnalyzeCsvState,
  formData: FormData,
): Promise<AnalyzeCsvState> {
  const session = await auth();
  if (!session?.householdId) {
    return { step: "upload", error: "You must be logged in to import a CSV." };
  }

  const accountId = String(formData.get("accountId") ?? "");
  const file = formData.get("file");

  if (!accountId) {
    return { step: "upload", error: "Select an account." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { step: "upload", error: "Choose a CSV file to upload." };
  }

  // The <select> on the upload form only ever lists this household's own
  // accounts, but a tampered request could submit an arbitrary id — this
  // is the real guard, mirroring parseTransactionForm's account check.
  const accounts = await listAccounts(session.householdId);
  if (!accounts.some((account) => account.id === accountId)) {
    return { step: "upload", error: "Invalid account." };
  }

  let csvText: string;
  try {
    csvText = await file.text();
  } catch {
    return { step: "upload", error: "Could not read the uploaded file." };
  }

  const preview = previewCsv(csvText);
  if (preview.headers.length === 0) {
    return { step: "upload", error: "The CSV file appears to be empty." };
  }

  return {
    step: "mapping",
    accountId,
    filename: file.name,
    csvText,
    headers: preview.headers,
    sampleRows: preview.sampleRows,
  };
}

export type CreateImportBatchState = {
  error?: string;
};

export async function createImportBatchAction(
  _prevState: CreateImportBatchState,
  formData: FormData,
): Promise<CreateImportBatchState> {
  const session = await auth();
  if (!session?.householdId || !session.userId) {
    return { error: "You must be logged in to import a CSV." };
  }

  const accountId = String(formData.get("accountId") ?? "");
  const filename = String(formData.get("filename") ?? "");
  const csvText = String(formData.get("csvText") ?? "");
  const dateColumn = Number(formData.get("dateColumn"));
  const descriptionColumn = Number(formData.get("descriptionColumn"));
  const amountColumn = Number(formData.get("amountColumn"));

  if (!accountId || !filename || !csvText) {
    return { error: "Missing upload data — please start over." };
  }
  if (
    !Number.isInteger(dateColumn) ||
    !Number.isInteger(descriptionColumn) ||
    !Number.isInteger(amountColumn) ||
    dateColumn < 0 ||
    descriptionColumn < 0 ||
    amountColumn < 0
  ) {
    return { error: "Map each of date, description, and amount to a column." };
  }

  // Re-validate the account belongs to this household (same guard as
  // analyzeCsvAction — the hidden accountId field carried across the two
  // form submissions could just as easily have been tampered with).
  const accounts = await listAccounts(session.householdId);
  if (!accounts.some((account) => account.id === accountId)) {
    return { error: "Invalid account." };
  }

  const mapping: ColumnMapping = {
    dateColumn,
    descriptionColumn,
    amountColumn,
  };
  const rows = parseCsvRows(csvText, mapping);

  const batch = await createImportBatch(
    session.householdId,
    accountId,
    session.userId,
    filename,
    rows,
  );

  // Deliberately not revalidatePath + return {} here (unlike the other
  // app/(app)/*/actions.ts forms) — this flow's "next state" is a whole new
  // page (the staged preview), not a refreshed version of the current one.
  // redirect() throws a NEXT_REDIRECT internally, which must propagate.
  redirect(`/import/${batch.id}`);
}

/**
 * Plain (non-useActionState) server action for the staged-batch preview
 * page's "Re-apply category rules" button (Task 13). Re-runs the
 * household's current CategoryRules against every row of an
 * already-existing batch — this is how a rule created (or edited/deleted)
 * AFTER a batch was staged gets picked up, without re-uploading the CSV.
 * No pending/error UI needed beyond the page simply refreshing with
 * updated categories, mirroring deleteTransactionAction/archiveAccountAction.
 */
export async function reapplyCategoryRulesAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.householdId) {
    return;
  }

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) {
    return;
  }

  // applyCategoryRulesToBatch scopes its lookup by the batch's Account's
  // householdId — the actual cross-household guard, not just this action
  // reading session.householdId.
  await applyCategoryRulesToBatch(session.householdId, batchId);
  revalidatePath(`/import/${batchId}`);
}

/**
 * The default priority given to a CategoryRule created via this page's
 * "save as rule" control (see correctImportRowCategoryAction below). Chosen
 * low (0) so a saved correction — an `exact` match against one specific
 * row's verbatim raw description, i.e. a precise, user-verified override —
 * naturally outranks the household's other, broader rules: CategoryRuleForm
 * (Task 13) suggests 10 as its placeholder starting point for user-authored
 * rules, and lower numbers win first (see lib/categorize.ts). A rule this
 * specific should virtually never lose to a more general one.
 */
const SAVED_CORRECTION_RULE_PRIORITY = 0;

/**
 * Plain (non-useActionState) server action for the staged-batch review
 * page's per-row category correction form (Task 14). Sets the row's
 * category (or clears it, when the "Uncategorized" option is chosen) and
 * flips its `categorySource` to "manual" via lib/imports.ts's
 * updateImportRowCategory — the real household-scoping + category-ownership
 * guard, not just this action reading session.householdId. Also
 * optionally creates a new CategoryRule from the correction when the
 * "save as rule" checkbox was checked (an opt-in control alongside the
 * category <select>, per this task's AC) — an `exact` match against this
 * row's rawDescription pointed at the newly-chosen category, so future
 * imports containing the same exact description auto-categorize the same
 * way. No pending/error UI needed beyond the page refreshing with the
 * updated category, mirroring reapplyCategoryRulesAction/
 * deleteTransactionAction.
 */
export async function correctImportRowCategoryAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.householdId) {
    return;
  }

  const batchId = String(formData.get("batchId") ?? "");
  const rowId = String(formData.get("rowId") ?? "");
  const categoryIdRaw = String(formData.get("categoryId") ?? "");
  const categoryId = categoryIdRaw === "" ? null : categoryIdRaw;
  const saveAsRule = formData.get("saveAsRule") === "1";

  if (!batchId || !rowId) {
    return;
  }

  const row = await updateImportRowCategory(session.householdId, rowId, categoryId);

  if (row && saveAsRule && categoryId) {
    await createCategoryRule(session.householdId, {
      matchType: "exact",
      pattern: row.rawDescription,
      categoryId,
      priority: SAVED_CORRECTION_RULE_PRIORITY,
    });
  }

  revalidatePath(`/import/${batchId}`);
}

/**
 * Plain server action for the staged-batch review page's per-row
 * include/skip toggle (Task 14). `includeInCommit` arrives as the toggle
 * button's hidden "next value" field (the standard no-JS toggle-button
 * trick: the button's own form always submits the OPPOSITE of the row's
 * current state). setImportRowIncludeInCommit refuses to touch a row with a
 * parseError — those are "blocked", a distinct state from a deliberate
 * skip, and the review UI doesn't render this toggle for them at all (see
 * ImportPreviewTable).
 */
export async function setImportRowIncludeInCommitAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.householdId) {
    return;
  }

  const batchId = String(formData.get("batchId") ?? "");
  const rowId = String(formData.get("rowId") ?? "");
  const includeInCommit = String(formData.get("includeInCommit") ?? "") === "true";

  if (!batchId || !rowId) {
    return;
  }

  await setImportRowIncludeInCommit(session.householdId, rowId, includeInCommit);
  revalidatePath(`/import/${batchId}`);
}

/**
 * Plain server action for the staged-batch review page's "Commit" button
 * (Task 14's final step). Delegates the actual atomic create-Transactions
 * + flag-batch-committed logic to lib/imports.ts's commitImportBatch (see
 * its docstring for the double-commit guard). `session.userId` becomes
 * every created Transaction's `createdByUserId` — there is no "system"
 * user, so the household member who clicks Commit is recorded as having
 * created these transactions, same as manual entry.
 *
 * Failure (batch not found / wrong household / already committed) is a
 * silent no-op here, same as this page's other plain actions — in normal
 * use the Commit button/forms above are never even rendered once
 * `batch.committed` is true, so this path is only reachable via a genuine
 * race (e.g. a double click), which correctly creates nothing extra.
 */
export async function commitImportBatchAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.householdId || !session.userId) {
    return;
  }

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) {
    return;
  }

  await commitImportBatch(session.householdId, batchId, session.userId);
  revalidatePath(`/import/${batchId}`);
  revalidatePath("/transactions");
}
