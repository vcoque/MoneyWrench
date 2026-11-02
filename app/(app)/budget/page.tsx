import { auth } from "@/lib/auth";
import { listCategories } from "@/lib/categories";
import {
  getAllocationsForPeriod,
  getOrCreateBudgetPeriod,
} from "@/lib/budgets";
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
  const year =
    Number.isInteger(yearParam) && yearParam > 0
      ? yearParam
      : now.getFullYear();
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
  const period = await getOrCreateBudgetPeriod(
    session.householdId,
    year,
    month,
  );

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
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Budget</h1>
        <p className="page-lede">
          Set an overall target and allocate planned amounts to categories for
          the month.
        </p>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between gap-3">
          <a href={monthHref(prev.year, prev.month)} className="link-quiet">
            ← Previous month
          </a>
          <span className="text-lg font-medium">{monthLabel}</span>
          <a href={monthHref(next.year, next.month)} className="link-quiet">
            Next month →
          </a>
        </div>

        <form method="get" className="flex items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="jump-year" className="label">
              Year
            </label>
            <input
              id="jump-year"
              name="year"
              type="number"
              defaultValue={year}
              className="w-24 input"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="jump-month" className="label">
              Month
            </label>
            <input
              id="jump-month"
              name="month"
              type="number"
              min={1}
              max={12}
              defaultValue={month}
              className="w-20 input"
            />
          </div>
          <button type="submit" className="btn-secondary">
            Go
          </button>
        </form>
      </div>

      <div className="panel">
        <h2 className="panel-title">Overall target</h2>
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

      <div className="panel">
        <div className="flex items-center justify-between">
          <h2 className="panel-title">Category allocations</h2>
          <form action={copyLastMonthAction}>
            <input type="hidden" name="budgetPeriodId" value={period.id} />
            <button type="submit" className="link-quiet">
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
