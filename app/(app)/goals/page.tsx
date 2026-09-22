import { auth } from "@/lib/auth";
import { listGoalsWithProgress, type GoalWithProgress } from "@/lib/goals";
import GoalForm from "./goal-form";

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function GoalCard({ goal }: { goal: GoalWithProgress }) {
  const target = Number(goal.targetAmount);
  const progress = Number(goal.progress);
  // Progress can exceed the target (e.g. over-contributing) — the number
  // shown is never capped, but the bar's fill width is capped at 100% so an
  // over-funded goal doesn't overflow the track.
  const percent = target > 0 ? Math.min(100, (progress / target) * 100) : 0;

  return (
    <li className="flex flex-col gap-2 rounded-md border border-zinc-300 px-3 py-3 text-sm dark:border-zinc-700">
      <div className="flex items-center justify-between">
        <span className="font-medium">{goal.name}</span>
        <span className="text-zinc-500">
          {formatCurrency(progress)} / {formatCurrency(target)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </li>
  );
}

export default async function GoalsPage() {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route (see
  // middleware.ts), but the query below still only ever uses the
  // server-verified session.householdId — never a client-supplied value.
  if (!session?.householdId) {
    return null;
  }

  const goals = await listGoalsWithProgress(session.householdId);

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-24">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Savings Goals
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Set a target and track progress. Contributing to a goal is just
          logging a transaction to its category on the Transactions page.
        </p>
      </div>

      <GoalForm />

      <div className="flex w-full max-w-md flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Existing goals
        </h2>

        {goals.length === 0 ? (
          <p className="text-sm text-zinc-500">No savings goals yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
