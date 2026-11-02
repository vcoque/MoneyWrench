"use client";

import { useActionState } from "react";
import {
  CATEGORY_RULE_MATCH_TYPES,
  CATEGORY_RULE_MATCH_TYPE_LABELS,
} from "@/lib/category-rule-types";
import type { CategoryRuleFormState } from "./actions";

const initialState: CategoryRuleFormState = {};

// Plain { id, name } shape rather than importing Category from
// @prisma/client — mirrors account-types.ts/category-types.ts's rule of
// never pulling PrismaClient into a client-bundled file, even type-only.
type SelectOption = { id: string; name: string };

export type CategoryRuleFormDefaults = {
  id: string;
  matchType: string;
  pattern: string;
  categoryId: string;
  priority: string;
};

type CategoryRuleFormProps = {
  action: (
    prevState: CategoryRuleFormState,
    formData: FormData,
  ) => Promise<CategoryRuleFormState>;
  categories: SelectOption[];
  defaultValues?: CategoryRuleFormDefaults;
  submitLabel: string;
  pendingLabel: string;
  onCancelHref?: string;
};

/**
 * Shared form for both creating and editing a category rule. Which server
 * action it posts to (createCategoryRuleAction vs updateCategoryRuleAction)
 * and whether it's pre-filled is entirely determined by the props the page
 * passes in — no create/edit branching lives inside this component itself.
 * Mirrors app/(app)/transactions/TransactionForm.tsx.
 */
export default function CategoryRuleForm({
  action,
  categories,
  defaultValues,
  submitLabel,
  pendingLabel,
  onCancelHref,
}: CategoryRuleFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="panel">
      {defaultValues?.id && (
        <input type="hidden" name="ruleId" value={defaultValues.id} />
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="rule-match-type" className="label">
          Match type
        </label>
        <select
          id="rule-match-type"
          name="matchType"
          required
          defaultValue={
            defaultValues?.matchType ?? CATEGORY_RULE_MATCH_TYPES[0]
          }
          className="input"
        >
          {CATEGORY_RULE_MATCH_TYPES.map((type) => (
            <option key={type} value={type}>
              {CATEGORY_RULE_MATCH_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="rule-pattern" className="label">
          Pattern
        </label>
        <input
          id="rule-pattern"
          name="pattern"
          required
          placeholder="e.g. STARBUCKS"
          defaultValue={defaultValues?.pattern}
          className="input"
        />
        <p className="text-xs text-muted">
          Matched against the transaction description, case-insensitively. For
          &quot;Regex&quot;, this is a regular expression body (no slashes
          needed).
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="rule-category" className="label">
          Category
        </label>
        <select
          id="rule-category"
          name="categoryId"
          required
          defaultValue={defaultValues?.categoryId ?? ""}
          className="input"
        >
          <option value="" disabled>
            Select a category
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="rule-priority" className="label">
          Priority
        </label>
        <input
          id="rule-priority"
          name="priority"
          type="number"
          step="1"
          required
          placeholder="10"
          defaultValue={defaultValues?.priority}
          className="input"
        />
        <p className="text-xs text-muted">
          Lower numbers are evaluated first. When multiple rules match a
          transaction, the lowest-priority-number rule wins.
        </p>
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
