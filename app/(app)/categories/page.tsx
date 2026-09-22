import type { Category } from "@prisma/client";
import { auth } from "@/lib/auth";
import { listCategories } from "@/lib/categories";
import { CATEGORY_KIND_LABELS } from "@/lib/category-types";
import CategoryForm from "./category-form";
import { archiveCategoryAction } from "./actions";

function CategoryRow({ category }: { category: Category }) {
  return (
    <li
      key={category.id}
      className="flex items-center justify-between rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
    >
      <span>{category.name}</span>
      <form action={archiveCategoryAction}>
        <input type="hidden" name="categoryId" value={category.id} />
        <button
          type="submit"
          className="text-red-600 underline hover:no-underline dark:text-red-400"
        >
          Archive
        </button>
      </form>
    </li>
  );
}

export default async function CategoriesPage() {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route (see
  // middleware.ts), but the query below still only ever uses the
  // server-verified session.householdId — never a client-supplied value.
  if (!session?.householdId) {
    return null;
  }

  const categories = await listCategories(session.householdId);

  // The list must distinguish expense categories from savings-goal-linked
  // categories (per this task's AC). Grouping by `kind` here — rather than
  // rendering a single flat list — means this rendering logic already
  // handles both kinds correctly, so Task 9 (which will start creating
  // savings_goal-kind categories) doesn't need to touch this page at all,
  // even though zero savings_goal categories exist to show right now.
  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const savingsGoalCategories = categories.filter(
    (c) => c.kind === "savings_goal",
  );

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-24">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Categories
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Add and manage the categories your household uses to classify
          transactions.
        </p>
      </div>

      <CategoryForm />

      <div className="flex w-full max-w-md flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {CATEGORY_KIND_LABELS.expense} categories
        </h2>

        {expenseCategories.length === 0 ? (
          <p className="text-sm text-zinc-500">No expense categories yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {expenseCategories.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {CATEGORY_KIND_LABELS.savings_goal} categories
        </h2>

        {savingsGoalCategories.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No savings goal categories yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {savingsGoalCategories.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
