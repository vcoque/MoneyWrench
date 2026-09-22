import type { BudgetTargetType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getOrCreateBudgetPeriod } from "@/lib/budgets";
import { getBudgetDashboard, type CategoryBudgetRow } from "@/lib/budget";
import { BUDGET_TARGET_TYPE_LABELS } from "@/lib/budget-types";

type DashboardPageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

// Identical URL pattern (?year=&month=), default-to-current-month behavior,
// and prev/next navigation as app/(app)/budget/page.tsx (Task 10), for
// consistency between the two period-scoped pages.

function monthHref(year: number, month: number): string {
  return `/dashboard?year=${year}&month=${month}`;
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

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Fill percent for the visual bar, capped at 100% so an over/exceeded row
 * doesn't overflow its track (same capping convention as
 * app/(app)/goals/page.tsx's GoalCard). */
function fillPercent(actual: number, planned: number): number {
  if (planned <= 0) {
    // No planned amount to measure against: full (red) bar if there's any
    // actual spend at all, empty otherwise.
    return actual > 0 ? 100 : 0;
  }
  return Math.min(100, (actual / planned) * 100);
}

function BudgetRow({
  label,
  planned,
  actual,
  isOver,
  overLabel,
  underLabel,
}: {
  label: string;
  planned: number;
  actual: number;
  isOver: boolean;
  overLabel: string;
  underLabel: string;
}) {
  const percent = fillPercent(actual, planned);
  const difference = Math.abs(planned - actual);

  return (
    <li className="flex flex-col gap-2 rounded-md border border-zinc-300 px-3 py-3 text-sm dark:border-zinc-700">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="text-zinc-500">
          {formatCurrency(actual)} / {formatCurrency(planned)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full ${
            isOver
              ? "bg-red-600 dark:bg-red-500"
              : "bg-emerald-600 dark:bg-emerald-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={`text-xs font-medium ${
          isOver
            ? "text-red-700 dark:text-red-400"
            : "text-emerald-700 dark:text-emerald-400"
        }`}
      >
        {isOver
          ? `${formatCurrency(difference)} ${overLabel}`
          : `${formatCurrency(difference)} ${underLabel}`}
      </span>
    </li>
  );
}

function CategoryBudgetItem({ row }: { row: CategoryBudgetRow }) {
  const planned = Number(row.planned);
  const actual = Number(row.actual);
  // Categories are plain sums with no income/expense offsetting (see
  // lib/budget.ts), so "over" simply means actual spend/save exceeded the
  // planned amount — including a category with no allocation at all
  // (planned 0) that has any actual transactions this period, which is
  // exactly the unplanned-spending case this indicator should flag.
  const isOver = actual > planned;

  return (
    <BudgetRow
      label={row.categoryName}
      planned={planned}
      actual={actual}
      isOver={isOver}
      overLabel="over"
      underLabel="left"
    />
  );
}

function OverallBudgetItem({
  target,
  targetType,
  actual,
}: {
  target: number;
  targetType: BudgetTargetType;
  actual: number;
}) {
  // spend_limit: exceeding the target is the bad direction (over budget).
  // save_target: exceeding the target is the GOOD direction (goal met or
  // surpassed) — the visual indicator is flipped so "under" (not yet at
  // target) is the neutral/in-progress state rather than a false "over
  // budget" warning on a savings goal.
  const isOver = targetType === "spend_limit" ? actual > target : actual < target;
  const overLabel = targetType === "spend_limit" ? "over" : "remaining";
  const underLabel = targetType === "spend_limit" ? "left" : "surplus";

  return (
    <BudgetRow
      label={BUDGET_TARGET_TYPE_LABELS[targetType]}
      planned={target}
      actual={actual}
      isOver={isOver}
      overLabel={overLabel}
      underLabel={underLabel}
    />
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
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

  // Opens (or creates) this month's period, same as app/(app)/budget/page.tsx
  // — this is what makes "a period with no allocations yet" a normal, valid
  // state to land on (a freshly-opened, still-empty period) rather than an
  // error condition: getBudgetDashboard below just returns an empty
  // categories array for it.
  const period = await getOrCreateBudgetPeriod(session.householdId, year, month);
  const dashboard = await getBudgetDashboard(session.householdId, period);

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-24">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Planned vs. actual for the month, per category and overall.
        </p>
      </div>

      <div className="flex w-full max-w-md items-center justify-between gap-3">
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

      {dashboard.overall && (
        <div className="flex w-full max-w-md flex-col gap-2">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Overall
          </h2>
          <ul className="flex flex-col gap-2">
            <OverallBudgetItem
              target={Number(dashboard.overall.target)}
              targetType={dashboard.overall.targetType}
              actual={Number(dashboard.overall.actual)}
            />
          </ul>
        </div>
      )}

      <div className="flex w-full max-w-md flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Categories
        </h2>

        {dashboard.categories.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No planned or actual amounts for this period yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dashboard.categories.map((row) => (
              <CategoryBudgetItem key={row.categoryId} row={row} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
