import { auth } from "@/lib/auth";
import { listCategories } from "@/lib/categories";
import { getAllocationsForPeriod, getOrCreateBudgetPeriod } from "@/lib/budgets";
import OverallTargetForm from "./overall-target-form";
import AllocationsForm from "./allocations-form";
import { copyLastMonthAction } from "./actions";

type BudgetPageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

function monthHref(year: number, month: number): string {
  return `/budget?year=${year}&month=${month}`;
}

/** {year, month} shifted by `delta` calendar months, rolling over the year
 * boundary (e.g. Dec 2025 + 1 => Jan 2026, Jan 2026 - 1 => Dec 2025). */
function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBasedTotal = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(zeroBasedTotal / 12),
    month: (((zeroBasedTotal % 12) + 12) % 12) + 1,
  };
}

export default async function BudgetPage({ searchParams }: BudgetPageProps) {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route (see
  // middleware.ts), but every query below still only ever uses the
  // server-verified session.householdId — never a client-supplied value.
  if (!session?.householdId) {
    return null;
  }

  const params = await searchParams;
  const now = new Date();
  const yearParam = Number(params.year);
  const monthParam = Number(params.month);
  const year = Number.isInteger(yearParam) && yearParam > 0 ? yearParam : now.getFullYear();
  const month =
    Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12
      ? monthParam
      : now.getMonth() + 1;

  // Opens (or creates) this month's period. Called with no target args, so
  // it never clobbers an already-set overall target — see
  // getOrCreateBudgetPeriod's doc comment in lib/budgets.ts. This is what
  // makes "create a budget period for a month" happen implicitly, just by
  // navigating here: visiting /budget?year=2026&month=4 for the first time
  // creates the April 2026 period.
  const period = await getOrCreateBudgetPeriod(session.householdId, year, month);

  const [categories, allocations] = await Promise.all([
    listCategories(session.householdId),
    getAllocationsForPeriod(period.id),
  ]);

  const amountByCategoryId = new Map(
    allocations.map((allocation) => [
      allocation.categoryId,
      Number(allocation.plannedAmount).toFixed(2),
    ]),
  );

  const categoryAllocations = categories.map((category) => ({
    id: category.id,
    name: category.name,
    amount: amountByCategoryId.get(category.id) ?? "",
  }));

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-24">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Budget
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Set an overall target and allocate planned amounts to categories for
          the month.
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <a
            href={monthHref(prev.year, prev.month)}
            className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400"
          >
            ← Previous month
          </a>
          <span className="text-lg font-medium">{monthLabel}</span>
          <a
            href={monthHref(next.year, next.month)}
            className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400"
          >
            Next month →
          </a>
        </div>

        <form method="get" className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="jump-year"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Year
            </label>
            <input
              id="jump-year"
              name="year"
              type="number"
              defaultValue={year}
              className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="jump-month"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Month
            </label>
            <input
              id="jump-month"
              name="month"
              type="number"
              min={1}
              max={12}
              defaultValue={month}
              className="w-20 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Go
          </button>
        </form>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Overall target
        </h2>
        <OverallTargetForm
          year={year}
          month={month}
          defaultAmount={
            period.overallTarget !== null
              ? Number(period.overallTarget).toFixed(2)
              : ""
          }
          defaultType={period.overallTargetType ?? ""}
        />
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Category allocations
          </h2>
          <form action={copyLastMonthAction}>
            <input type="hidden" name="budgetPeriodId" value={period.id} />
            <button
              type="submit"
              className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400"
            >
              Copy last month
            </button>
          </form>
        </div>
        <AllocationsForm
          budgetPeriodId={period.id}
          categories={categoryAllocations}
        />
      </div>
    </main>
  );
}
