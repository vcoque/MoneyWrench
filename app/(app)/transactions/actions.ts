"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  type TransactionInput,
} from "@/lib/transactions";
import { isTransactionType } from "@/lib/transaction-types";

export type TransactionFormState = {
  error?: string;
};

/**
 * Parses + validates a transaction form submission. Beyond basic field
 * presence, this also checks that the submitted accountId/categoryId
 * actually belong to the caller's household — the <select> options in
 * TransactionForm only ever list the household's own accounts/categories,
 * but a tampered request could submit an arbitrary id, so this is the real
 * guard against linking a transaction to another household's account or
 * category (household scoping isn't just about the Transaction row itself).
 */
type ParsedTransactionForm =
  | { ok: true; data: TransactionInput }
  | { ok: false; error: string };

async function parseTransactionForm(
  formData: FormData,
  householdId: string,
): Promise<ParsedTransactionForm> {
  const dateRaw = String(formData.get("date") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const categoryIdRaw = String(formData.get("categoryId") ?? "");
  const categoryId = categoryIdRaw === "" ? null : categoryIdRaw;

  if (!dateRaw) {
    return { ok: false, error: "Date is required." };
  }
  const date = new Date(dateRaw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "Invalid date." };
  }

  if (!accountId) {
    return { ok: false, error: "Account is required." };
  }

  if (!isTransactionType(type)) {
    return { ok: false, error: "Invalid transaction type." };
  }

  if (!description) {
    return { ok: false, error: "Description is required." };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(amountRaw) || Number(amountRaw) <= 0) {
    return {
      ok: false,
      error: "Amount must be a positive number (up to 2 decimals).",
    };
  }

  const [accounts, categories] = await Promise.all([
    listAccounts(householdId),
    listCategories(householdId),
  ]);

  if (!accounts.some((account) => account.id === accountId)) {
    return { ok: false, error: "Invalid account." };
  }
  if (categoryId && !categories.some((category) => category.id === categoryId)) {
    return { ok: false, error: "Invalid category." };
  }

  return {
    ok: true,
    data: { accountId, categoryId, date, amount: amountRaw, type, description },
  };
}

export async function createTransactionAction(
  _prevState: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route, but never
  // trust a client-supplied householdId/userId — read them from the server
  // session, which is sourced from the DB (see lib/auth.config.ts). This
  // also means a user can only ever create a transaction in their OWN
  // household.
  if (!session?.householdId || !session.userId) {
    return { error: "You must be logged in to add a transaction." };
  }

  const parsed = await parseTransactionForm(formData, session.householdId);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  await createTransaction(session.householdId, session.userId, parsed.data);
  revalidatePath("/transactions");
  return {};
}

export async function updateTransactionAction(
  _prevState: TransactionFormState,
  formData: FormData,
): Promise<TransactionFormState> {
  const session = await auth();
  if (!session?.householdId) {
    return { error: "You must be logged in to edit a transaction." };
  }

  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) {
    return { error: "Missing transaction." };
  }

  const parsed = await parseTransactionForm(formData, session.householdId);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  // updateTransaction scopes its update by id, householdId, AND
  // source: "manual", so a transaction belonging to another household (or a
  // future imported transaction) silently matches zero rows rather than
  // being edited.
  const updated = await updateTransaction(
    session.householdId,
    transactionId,
    parsed.data,
  );
  if (!updated) {
    return { error: "Transaction not found or cannot be edited." };
  }

  revalidatePath("/transactions");
  return {};
}

/**
 * Plain (non-useActionState) server action for the per-row delete button —
 * deleting doesn't need pending/error UI beyond the list simply refreshing
 * without the deleted row, so there's no client component/state needed
 * here, unlike create/edit. Mirrors archiveAccountAction/archiveCategoryAction,
 * except this is a real hard delete (see lib/transactions.ts).
 */
export async function deleteTransactionAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.householdId) {
    return;
  }

  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) {
    return;
  }

  // deleteTransaction scopes its delete by id, householdId, AND
  // source: "manual" — the actual cross-household and import-protection
  // guard, not just this action reading session.householdId.
  await deleteTransaction(session.householdId, transactionId);
  revalidatePath("/transactions");
}
