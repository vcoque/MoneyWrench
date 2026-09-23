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
    <form action={formAction} className="flex w-full max-w-md flex-col gap-3">
      {defaultValues?.id && (
        <input type="hidden" name="ruleId" value={defaultValues.id} />
      )}

      <div className="flex flex-col gap-1">
        <label
          htmlFor="rule-match-type"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Match type
        </label>
        <select
          id="rule-match-type"
          name="matchType"
          required
          defaultValue={defaultValues?.matchType ?? CATEGORY_RULE_MATCH_TYPES[0]}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {CATEGORY_RULE_MATCH_TYPES.map((type) => (
            <option key={type} value={type}>
              {CATEGORY_RULE_MATCH_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="rule-pattern"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Pattern
        </label>
        <input
          id="rule-pattern"
          name="pattern"
          required
          placeholder="e.g. STARBUCKS"
          defaultValue={defaultValues?.pattern}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="text-xs text-zinc-500">
          Matched against the transaction description, case-insensitively.
          For &quot;Regex&quot;, this is a regular expression body (no
          slashes needed).
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="rule-category"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Category
        </label>
        <select
          id="rule-category"
          name="categoryId"
          required
          defaultValue={defaultValues?.categoryId ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
        <label
          htmlFor="rule-priority"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
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
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="text-xs text-zinc-500">
          Lower numbers are evaluated first. When multiple rules match a
          transaction, the lowest-priority-number rule wins.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {pending ? pendingLabel : submitLabel}
        </button>

        {onCancelHref && (
          <a
            href={onCancelHref}
            className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400"
          >
            Cancel
          </a>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
