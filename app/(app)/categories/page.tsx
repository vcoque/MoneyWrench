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
      className="row-card flex-row items-center justify-between"
    >
      <span>{category.name}</span>
      <form action={archiveCategoryAction}>
        <input type="hidden" name="categoryId" value={category.id} />
        <button type="submit" className="link-danger">
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
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Categories</h1>
        <p className="page-lede">
          Add and manage the categories your household uses to classify
          transactions.
        </p>
      </div>

      <CategoryForm />

      <div className="panel">
        <h2 className="panel-title">
          {CATEGORY_KIND_LABELS.expense} categories
        </h2>

        {expenseCategories.length === 0 ? (
          <p className="hint">No expense categories yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {expenseCategories.map((category) => (
              <CategoryRow key={category.id} category={category} />
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h2 className="panel-title">
          {CATEGORY_KIND_LABELS.savings_goal} categories
        </h2>

        {savingsGoalCategories.length === 0 ? (
          <p className="hint">No savings goal categories yet.</p>
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
