"use client";

import { useActionState } from "react";
import { saveAllocationsAction, type BudgetActionState } from "./actions";

const initialState: BudgetActionState = {};

export type CategoryAllocationInput = {
  id: string;
  name: string;
  /** Existing planned amount formatted as "0.00", or "" if unset. */
  amount: string;
};

type AllocationsFormProps = {
  budgetPeriodId: string;
  categories: CategoryAllocationInput[];
};

export default function AllocationsForm({
  budgetPeriodId,
  categories,
}: AllocationsFormProps) {
  const [state, formAction, pending] = useActionState(
    saveAllocationsAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-3">
      <input type="hidden" name="budgetPeriodId" value={budgetPeriodId} />

      {categories.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No categories yet — add some on the Categories page first.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-3"
            >
              <label
                htmlFor={`amount-${category.id}`}
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                {category.name}
              </label>
              <input
                id={`amount-${category.id}`}
                name={`amount-${category.id}`}
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={category.amount}
                className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={pending || categories.length === 0}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Saving…" : "Save allocations"}
      </button>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
