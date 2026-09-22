"use client";

import { useActionState } from "react";
import { createCategoryAction, type CreateCategoryState } from "./actions";

const initialState: CreateCategoryState = {};

// This form only ever creates expense-kind categories (no kind selector —
// savings_goal-kind categories are created by a future task alongside
// SavingsGoal creation, not through this UI).
export default function CategoryForm() {
  const [state, formAction, pending] = useActionState(
    createCategoryAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="category-name"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Category name
        </label>
        <input
          id="category-name"
          name="name"
          required
          placeholder="e.g. Groceries"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Adding…" : "Add category"}
      </button>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
