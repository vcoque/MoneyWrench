"use client";

import { useActionState } from "react";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/transaction-types";
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
    <form action={formAction} className="panel">
      {defaultValues?.id && (
        <input type="hidden" name="transactionId" value={defaultValues.id} />
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="transaction-date" className="label">
          Date
        </label>
        <input
          id="transaction-date"
          name="date"
          type="date"
          required
          defaultValue={defaultValues?.date}
          className="input"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="transaction-account" className="label">
          Account
        </label>
        <select
          id="transaction-account"
          name="accountId"
          required
          defaultValue={defaultValues?.accountId ?? ""}
          className="input"
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
        <label htmlFor="transaction-amount" className="label">
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
          className="input"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="transaction-type" className="label">
          Type
        </label>
        <select
          id="transaction-type"
          name="type"
          required
          defaultValue={defaultValues?.type ?? TRANSACTION_TYPES[0]}
          className="input"
        >
          {TRANSACTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {TRANSACTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="transaction-description" className="label">
          Description
        </label>
        <input
          id="transaction-description"
          name="description"
          required
          placeholder="e.g. Weekly groceries"
          defaultValue={defaultValues?.description}
          className="input"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="transaction-category" className="label">
          Category
        </label>
        <select
          id="transaction-category"
          name="categoryId"
          defaultValue={defaultValues?.categoryId ?? ""}
          className="input"
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
        <button type="submit" disabled={pending} className="btn">
          {pending ? pendingLabel : submitLabel}
        </button>

        {onCancelHref && (
          <a href={onCancelHref} className="link-quiet">
            Cancel
          </a>
        )}
      </div>

      {state.error && (
        <p role="alert" className="error-text">
          {state.error}
        </p>
      )}
    </form>
  );
}
