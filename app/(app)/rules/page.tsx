import { auth } from "@/lib/auth";
import { listCategories } from "@/lib/categories";
import { listCategoryRules } from "@/lib/category-rules";
import { CATEGORY_RULE_MATCH_TYPE_LABELS } from "@/lib/category-rule-types";
import CategoryRuleForm from "./category-rule-form";
import {
  createCategoryRuleAction,
  deleteCategoryRuleAction,
  updateCategoryRuleAction,
} from "./actions";

type RulesPageProps = {
  searchParams: Promise<{ edit?: string }>;
};

/**
 * CRUD page for CategoryRule (Task 13). Rules are listed in the exact order
 * they're evaluated — priority ascending, per the controller ruling that
 * lower priority number wins — so the list itself doubles as a readable
 * preview of "what would win" for an overlapping description.
 */
export default async function RulesPage({ searchParams }: RulesPageProps) {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route, but the
  // queries below still only ever use the server-verified
  // session.householdId — never a client-supplied value.
  if (!session?.householdId) {
    return null;
  }

  const params = await searchParams;

  const [categories, rules] = await Promise.all([
    listCategories(session.householdId),
    listCategoryRules(session.householdId),
  ]);

  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  // Editing is only ever offered for a rule that's in this household's own
  // list — `rules` above is already household-scoped, and
  // updateCategoryRuleAction/updateCategoryRule enforce the same guard for
  // real regardless of what this page renders.
  const editingRule = params.edit
    ? rules.find((rule) => rule.id === params.edit)
    : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-24">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Category rules
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Rules automatically categorize imported transactions by matching
          their description. New import batches apply your current rules
          right away; you can also re-apply rules to an already-staged
          batch from its preview page.
        </p>
      </div>

      {editingRule ? (
        <div className="flex w-full max-w-md flex-col gap-2">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Edit rule
          </h2>
          <CategoryRuleForm
            action={updateCategoryRuleAction}
            categories={categoryOptions}
            defaultValues={{
              id: editingRule.id,
              matchType: editingRule.matchType,
              pattern: editingRule.pattern,
              categoryId: editingRule.categoryId,
              priority: String(editingRule.priority),
            }}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            onCancelHref="/rules"
          />
        </div>
      ) : (
        <CategoryRuleForm
          action={createCategoryRuleAction}
          categories={categoryOptions}
          submitLabel="Add rule"
          pendingLabel="Adding…"
        />
      )}

      <div className="flex w-full max-w-2xl flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {rules.length} {rules.length === 1 ? "rule" : "rules"} (evaluated in
          this order)
        </h2>

        {rules.length === 0 ? (
          <p className="text-sm text-zinc-500">No rules yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              >
                <div className="flex flex-col">
                  <span>
                    <span className="font-mono text-zinc-500">
                      #{rule.priority}
                    </span>{" "}
                    {CATEGORY_RULE_MATCH_TYPE_LABELS[rule.matchType]} &quot;
                    {rule.pattern}&quot;
                  </span>
                  <span className="text-zinc-500">
                    → {rule.category.name}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={`/rules?edit=${rule.id}`}
                    className="text-zinc-600 underline hover:no-underline dark:text-zinc-400"
                  >
                    Edit
                  </a>
                  <form action={deleteCategoryRuleAction}>
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <button
                      type="submit"
                      className="text-red-600 underline hover:no-underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
