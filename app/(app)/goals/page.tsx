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
    <li className="row-card">
      <div className="flex items-center justify-between">
        <span className="font-medium">{goal.name}</span>
        <span className="text-muted">
          {formatCurrency(progress)} / {formatCurrency(target)}
        </span>
      </div>
      <div className="meter">
        <div
          className="h-full rounded-full bg-positive"
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
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Savings Goals</h1>
        <p className="page-lede">
          Set a target and track progress. Contributing to a goal is just
          logging a transaction to its category on the Transactions page.
        </p>
      </div>

      <GoalForm />

      <div className="panel">
        <h2 className="panel-title">Existing goals</h2>

        {goals.length === 0 ? (
          <p className="hint">No savings goals yet.</p>
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
