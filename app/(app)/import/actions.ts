"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { previewCsv, parseCsvRows, type ColumnMapping } from "@/lib/csv";
import { createImportBatch } from "@/lib/imports";

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
