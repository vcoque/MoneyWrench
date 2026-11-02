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
    <form action={formAction} className="panel">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      <div className="flex flex-col gap-1">
        <label htmlFor="overall-target" className="label">
          Overall target (optional)
        </label>
        <input
          id="overall-target"
          name="overallTarget"
          inputMode="decimal"
          placeholder="e.g. 3000.00"
          defaultValue={defaultAmount}
          className="input"
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

      <button type="submit" disabled={pending} className="btn">
        {pending ? "Saving…" : "Save target"}
      </button>

      {state.error && (
        <p role="alert" className="error-text">
          {state.error}
        </p>
      )}
    </form>
  );
}
