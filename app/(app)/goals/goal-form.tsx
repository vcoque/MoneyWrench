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
    <form action={formAction} className="panel">
      <div className="flex flex-col gap-1">
        <label htmlFor="goal-name" className="label">
          Goal name
        </label>
        <input
          id="goal-name"
          name="name"
          required
          placeholder="e.g. Vacation Fund"
          className="input"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="goal-target-amount" className="label">
          Target amount
        </label>
        <input
          id="goal-target-amount"
          name="targetAmount"
          required
          inputMode="decimal"
          placeholder="e.g. 2000.00"
          className="input"
        />
      </div>

      <button type="submit" disabled={pending} className="btn">
        {pending ? "Adding…" : "Add goal"}
      </button>

      {state.error && (
        <p role="alert" className="error-text">
          {state.error}
        </p>
      )}
    </form>
  );
}
