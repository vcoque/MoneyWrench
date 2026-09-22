"use client";

import { useActionState } from "react";
import { TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS } from "@/lib/transaction-types";
import type { TransactionFormState } from "./actions";

const initialState: TransactionFormState = {};

// Plain { id, name } shape rather than importing Account/Category from
// @prisma/client — mirrors account-types.ts/category-types.ts's rule of
// never pulling PrismaClient into a client-bundled file, even type-only.
type SelectOption = { id: string; name: string };

export type TransactionFormDefaults = {
  id: string;
  date: string; // "YYYY-MM-DD", matches <input type="date">
  accountId: string;
  amount: string;
  type: string;
  description: string;
  categoryId: string; // "" means no category
};

type TransactionFormProps = {
  action: (
    prevState: TransactionFormState,
    formData: FormData,
  ) => Promise<TransactionFormState>;
  accounts: SelectOption[];
  categories: SelectOption[];
  defaultValues?: TransactionFormDefaults;
  submitLabel: string;
  pendingLabel: string;
  onCancelHref?: string;
};

/**
 * Shared form for both creating and editing a manual transaction. Which
 * server action it posts to (createTransactionAction vs
 * updateTransactionAction) and whether it's pre-filled is entirely
 * determined by the props the page passes in — no create/edit branching
 * lives inside this component itself.
 */
export default function TransactionForm({
  action,
  accounts,
  categories,
  defaultValues,
  submitLabel,
  pendingLabel,
  onCancelHref,
}: TransactionFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-3">
      {defaultValues?.id && (
        <input type="hidden" name="transactionId" value={defaultValues.id} />
      )}

      <div className="flex flex-col gap-1">
        <label
          htmlFor="transaction-date"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Date
        </label>
        <input
          id="transaction-date"
          name="date"
          type="date"
          required
          defaultValue={defaultValues?.date}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="transaction-account"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Account
        </label>
        <select
          id="transaction-account"
          name="accountId"
          required
          defaultValue={defaultValues?.accountId ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="" disabled>
            Select an account
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="transaction-amount"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Amount
        </label>
        <input
          id="transaction-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder="0.00"
          defaultValue={defaultValues?.amount}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="transaction-type"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Type
        </label>
        <select
          id="transaction-type"
          name="type"
          required
          defaultValue={defaultValues?.type ?? TRANSACTION_TYPES[0]}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {TRANSACTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {TRANSACTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="transaction-description"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Description
        </label>
        <input
          id="transaction-description"
          name="description"
          required
          placeholder="e.g. Weekly groceries"
          defaultValue={defaultValues?.description}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="transaction-category"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Category
        </label>
        <select
          id="transaction-category"
          name="categoryId"
          defaultValue={defaultValues?.categoryId ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Uncategorized</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {pending ? pendingLabel : submitLabel}
        </button>

        {onCancelHref && (
          <a
            href={onCancelHref}
            className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400"
          >
            Cancel
          </a>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
