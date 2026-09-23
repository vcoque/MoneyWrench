import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getImportBatch } from "@/lib/imports";
import { reapplyCategoryRulesAction } from "../actions";

/**
 * Staged import preview (Task 12's final step): shows every parsed row from
 * an ImportBatch, flagging any with a parseError rather than hiding it.
 * Task 13 extends this with a "Category" column (the row's auto-matched
 * category, or "Uncategorized") and a "Re-apply category rules" button, so
 * a rule created after this batch already existed can be applied to it
 * without re-uploading the CSV. Nothing here writes to Transaction —
 * committing the batch is a later task (14), and there is still no manual
 * per-row category override UI (that's also a later task). This page
 * otherwise remains read-only.
 */
export default async function ImportBatchPreviewPage({
  params,
}: PageProps<"/import/[batchId]">) {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route, but the
  // query below still only ever uses the server-verified
  // session.householdId — never a client-supplied value.
  if (!session?.householdId) {
    return null;
  }

  const { batchId } = await params;

  // getImportBatch scopes by householdId via the batch's Account relation —
  // the real cross-household guard, not just this page checking the
  // session. A batch belonging to another household resolves to null here,
  // same as one that doesn't exist at all.
  const batch = await getImportBatch(session.householdId, batchId);
  if (!batch) {
    notFound();
  }

  const flaggedCount = batch.rows.filter((row) => row.parseError).length;

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-24">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Import preview
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          {batch.filename} — {batch.rows.length}{" "}
          {batch.rows.length === 1 ? "row" : "rows"}
          {flaggedCount > 0 &&
            `, ${flaggedCount} flagged for review`}
          . Nothing has been saved as a transaction yet.
        </p>
      </div>

      <form action={reapplyCategoryRulesAction}>
        <input type="hidden" name="batchId" value={batch.id} />
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Re-apply category rules
        </button>
      </form>

      <div className="w-full max-w-4xl overflow-x-auto rounded-md border border-zinc-300 dark:border-zinc-700">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {batch.rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-zinc-200 last:border-0 dark:border-zinc-800 ${
                  row.parseError
                    ? "bg-red-50 dark:bg-red-950/30"
                    : ""
                }`}
              >
                <td className="px-3 py-2">
                  {row.parsedDate
                    ? row.parsedDate.toISOString().slice(0, 10)
                    : row.rawDate || "—"}
                </td>
                <td className="px-3 py-2">{row.rawDescription || "—"}</td>
                <td className="px-3 py-2">
                  {row.parsedAmount !== null
                    ? row.parsedAmount.toString()
                    : row.rawAmount || "—"}
                </td>
                <td className="px-3 py-2">
                  {row.category ? (
                    row.category.name
                  ) : (
                    <span className="text-zinc-500">Uncategorized</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.parseError ? (
                    <span
                      role="alert"
                      className="font-medium text-red-600 dark:text-red-400"
                    >
                      {row.parseError}
                    </span>
                  ) : (
                    <span className="text-zinc-500">OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link
        href="/import"
        className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400"
      >
        Import another file
      </Link>
    </main>
  );
}
