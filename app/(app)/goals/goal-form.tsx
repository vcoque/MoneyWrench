"use client";

import { useActionState } from "react";
import { createGoalAction, type CreateGoalState } from "./actions";

const initialState: CreateGoalState = {};

// No target-date/deadline field here by design — out of scope per the
// design spec (a SavingsGoal is just a name + target amount; there's no
// deadline column on the model).
export default function GoalForm() {
  const [state, formAction, pending] = useActionState(
    createGoalAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="goal-name"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Goal name
        </label>
        <input
          id="goal-name"
          name="name"
          required
          placeholder="e.g. Vacation Fund"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="goal-target-amount"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Target amount
        </label>
        <input
          id="goal-target-amount"
          name="targetAmount"
          required
          inputMode="decimal"
          placeholder="e.g. 2000.00"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Adding…" : "Add goal"}
      </button>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
