import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getImportBatch } from "@/lib/imports";
import { listCategories } from "@/lib/categories";
import {
  commitImportBatchAction,
  correctImportRowCategoryAction,
  reapplyCategoryRulesAction,
  setImportRowIncludeInCommitAction,
} from "../actions";

/**
 * Staged import review + commit page (Task 12's final step, extended by
 * Task 13 with auto-categorization display, and by Task 14 — this task —
 * into a genuinely editable review UI). Still a server component: every
 * per-row control below (category correction, include/skip toggle, the
 * commit button itself) is a plain `<form action={...}>` posting to a
 * server action, so no client-side interactivity/JS is required for any of
 * it — mirrors the rest of this app's list pages (delete/archive buttons,
 * "Re-apply category rules").
 *
 * Once `batch.committed` is true, all of the above forms/controls disappear
 * — editing a row's category or include/skip state after its Transaction
 * has already been created would silently desync from that Transaction
 * (ImportRow and Transaction become separate rows at commit time), so the
 * page instead renders a read-only summary + a link to the transaction
 * list.
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

  const categories = await listCategories(session.householdId);

  const blockedCount = batch.rows.filter((row) => row.parseError).length;
  const skippedCount = batch.rows.filter(
    (row) => !row.parseError && !row.includeInCommit,
  ).length;
  const eligibleCount = batch.rows.filter(
    (row) => !row.parseError && row.includeInCommit,
  ).length;

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-24">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Import preview
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          {batch.filename} — {batch.rows.length}{" "}
          {batch.rows.length === 1 ? "row" : "rows"}
          {blockedCount > 0 && `, ${blockedCount} blocked`}
          {skippedCount > 0 && `, ${skippedCount} skipped`}.{" "}
          {batch.committed
            ? "This batch has been committed."
            : `${eligibleCount} ${eligibleCount === 1 ? "row is" : "rows are"} ready to commit.`}
        </p>
      </div>

      {batch.committed ? (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          Committed —{" "}
          <Link href="/transactions" className="underline hover:no-underline">
            view the resulting transactions
          </Link>
          .
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <form action={reapplyCategoryRulesAction}>
            <input type="hidden" name="batchId" value={batch.id} />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Re-apply category rules
            </button>
          </form>

          <form action={commitImportBatchAction}>
            <input type="hidden" name="batchId" value={batch.id} />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              Commit {eligibleCount} {eligibleCount === 1 ? "transaction" : "transactions"}
            </button>
          </form>
        </div>
      )}

      <div className="w-full max-w-5xl overflow-x-auto rounded-md border border-zinc-300 dark:border-zinc-700">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Include</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {batch.rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-zinc-200 align-top last:border-0 dark:border-zinc-800 ${
                  row.parseError ? "bg-red-50 dark:bg-red-950/30" : ""
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
                  {batch.committed || row.parseError ? (
                    <span>
                      {row.category ? (
                        row.category.name
                      ) : (
                        <span className="text-zinc-500">Uncategorized</span>
                      )}
                      {row.category && (
                        <span className="ml-1 text-xs text-zinc-500">
                          ({row.categorySource === "manual" ? "manual" : "auto"})
                        </span>
                      )}
                    </span>
                  ) : (
                    <form
                      action={correctImportRowCategoryAction}
                      className="flex flex-col gap-1"
                    >
                      <input type="hidden" name="batchId" value={batch.id} />
                      <input type="hidden" name="rowId" value={row.id} />
                      <select
                        name="categoryId"
                        defaultValue={row.categoryId ?? ""}
                        aria-label={`Category for row ${row.rowIndex + 1}`}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <option value="">Uncategorized</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        <input type="checkbox" name="saveAsRule" value="1" />
                        Save as rule
                      </label>
                      <button
                        type="submit"
                        className="w-fit rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium dark:border-zinc-700"
                      >
                        Save
                      </button>
                      {row.categorySource === "manual" && (
                        <span className="text-xs text-zinc-500">
                          Manually corrected
                        </span>
                      )}
                    </form>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.parseError ? (
                    <span className="text-zinc-500">Blocked</span>
                  ) : batch.committed ? (
                    <span>{row.committedTransactionId ? "Committed" : "Skipped"}</span>
                  ) : (
                    <form action={setImportRowIncludeInCommitAction}>
                      <input type="hidden" name="batchId" value={batch.id} />
                      <input type="hidden" name="rowId" value={row.id} />
                      <input
                        type="hidden"
                        name="includeInCommit"
                        value={row.includeInCommit ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium dark:border-zinc-700"
                      >
                        {row.includeInCommit ? "Skip" : "Include"}
                      </button>
                    </form>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.parseError ? (
                    <span
                      role="alert"
                      className="font-medium text-red-600 dark:text-red-400"
                    >
                      {row.parseError} — fix in a future CSV re-upload
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
