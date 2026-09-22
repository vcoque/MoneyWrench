"use client";

import { useActionState } from "react";
import {
  BUDGET_TARGET_TYPES,
  BUDGET_TARGET_TYPE_LABELS,
} from "@/lib/budget-types";
import { setOverallTargetAction, type BudgetActionState } from "./actions";

const initialState: BudgetActionState = {};

type OverallTargetFormProps = {
  year: number;
  month: number;
  defaultAmount: string;
  defaultType: string;
};

// Radio group includes an explicit "No target" option (value "") alongside
// spend_limit/save_target — plain HTML radios can't be un-checked by the
// user once one is selected, so without this there'd be no way to clear a
// previously-set target back to null via the form.
export default function OverallTargetForm({
  year,
  month,
  defaultAmount,
  defaultType,
}: OverallTargetFormProps) {
  const [state, formAction, pending] = useActionState(
    setOverallTargetAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-3">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      <div className="flex flex-col gap-1">
        <label
          htmlFor="overall-target"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Overall target (optional)
        </label>
        <input
          id="overall-target"
          name="overallTarget"
          inputMode="decimal"
          placeholder="e.g. 3000.00"
          defaultValue={defaultAmount}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="overallTargetType"
            value=""
            defaultChecked={defaultType === ""}
          />
          No target
        </label>
        {BUDGET_TARGET_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-2">
            <input
              type="radio"
              name="overallTargetType"
              value={type}
              defaultChecked={defaultType === type}
            />
            {BUDGET_TARGET_TYPE_LABELS[type]}
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Saving…" : "Save target"}
      </button>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
