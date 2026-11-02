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
    <form action={formAction} className="panel">
      <input type="hidden" name="budgetPeriodId" value={budgetPeriodId} />

      {categories.length === 0 ? (
        <p className="hint">
          No categories yet — add some on the Categories page first.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-3"
            >
              <label htmlFor={`amount-${category.id}`} className="label">
                {category.name}
              </label>
              <input
                id={`amount-${category.id}`}
                name={`amount-${category.id}`}
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={category.amount}
                className="w-32 input"
              />
            </li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={pending || categories.length === 0}
        className="btn"
      >
        {pending ? "Saving…" : "Save allocations"}
      </button>

      {state.error && (
        <p role="alert" className="error-text">
          {state.error}
        </p>
      )}
    </form>
  );
}
