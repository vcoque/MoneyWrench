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
    <form action={formAction} className="panel">
      <div className="flex flex-col gap-1">
        <label htmlFor="category-name" className="label">
          Category name
        </label>
        <input
          id="category-name"
          name="name"
          required
          placeholder="e.g. Groceries"
          className="input"
        />
      </div>

      <button type="submit" disabled={pending} className="btn">
        {pending ? "Adding…" : "Add category"}
      </button>

      {state.error && (
        <p role="alert" className="error-text">
          {state.error}
        </p>
      )}
    </form>
  );
}
