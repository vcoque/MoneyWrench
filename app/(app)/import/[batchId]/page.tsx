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
 * Task 13 with auto-categorization display, by Task 14 into a genuinely
 * editable review UI, and by Task 15 with a "likely duplicate" indicator).
 * Still a server component: every per-row control below (category
 * correction, include/skip toggle, the commit button itself) is a plain
 * `<form action={...}>` posting to a server action, so no client-side
 * interactivity/JS is required for any of it — mirrors the rest of this
 * app's list pages (delete/archive buttons, "Re-apply category rules").
 *
 * A row flagged `isDuplicate` (Task 15's createImportBatch check against
 * this account's existing Transactions) starts with `includeInCommit:
 * false` already set — there's no separate duplicate-specific control here;
 * it reuses Task 14's existing per-row include/skip toggle, so a user who
 * confirms it's a legitimate repeat just clicks "Include" like they would
 * for any other skipped row.
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
  const duplicateCount = batch.rows.filter((row) => row.isDuplicate).length;
  const skippedCount = batch.rows.filter(
    (row) => !row.parseError && !row.includeInCommit,
  ).length;
  const eligibleCount = batch.rows.filter(
    (row) => !row.parseError && row.includeInCommit,
  ).length;

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-24">
      <div className="page-head">
        <h1 className="page-title">Import preview</h1>
        <p className="page-lede">
          {batch.filename} — {batch.rows.length}{" "}
          {batch.rows.length === 1 ? "row" : "rows"}
          {blockedCount > 0 && `, ${blockedCount} blocked`}
          {duplicateCount > 0 &&
            `, ${duplicateCount} likely ${duplicateCount === 1 ? "duplicate" : "duplicates"}`}
          {skippedCount > 0 && `, ${skippedCount} skipped`}.{" "}
          {batch.committed
            ? "This batch has been committed."
            : `${eligibleCount} ${eligibleCount === 1 ? "row is" : "rows are"} ready to commit.`}
        </p>
      </div>

      {batch.committed ? (
        <div className="rounded-[10px] border border-accent/30 bg-accent-soft px-4 py-3 text-sm font-semibold text-accent">
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
            <button type="submit" className="btn-secondary">
              Re-apply category rules
            </button>
          </form>

          <form action={commitImportBatchAction}>
            <input type="hidden" name="batchId" value={batch.id} />
            <button type="submit" className="btn">
              Commit {eligibleCount}{" "}
              {eligibleCount === 1 ? "transaction" : "transactions"}
            </button>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="th">Date</th>
              <th className="th">Description</th>
              <th className="th">Amount</th>
              <th className="th">Category</th>
              <th className="th">Include</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody>
            {batch.rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-line align-top last:border-0 ${
                  row.parseError
                    ? "bg-warn-soft"
                    : row.isDuplicate
                      ? "bg-chart-amber/15"
                      : ""
                }`}
              >
                <td className="td">
                  {row.parsedDate
                    ? row.parsedDate.toISOString().slice(0, 10)
                    : row.rawDate || "—"}
                </td>
                <td className="td">{row.rawDescription || "—"}</td>
                <td className="td">
                  {row.parsedAmount !== null
                    ? row.parsedAmount.toString()
                    : row.rawAmount || "—"}
                </td>
                <td className="td">
                  {batch.committed || row.parseError ? (
                    <span>
                      {row.category ? (
                        row.category.name
                      ) : (
                        <span className="text-muted">Uncategorized</span>
                      )}
                      {row.category && (
                        <span className="ml-1 text-xs text-muted">
                          ({row.categorySource === "manual" ? "manual" : "auto"}
                          )
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
                        className="input min-h-9 px-2 py-1"
                      >
                        <option value="">Uncategorized</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-muted">
                        <input type="checkbox" name="saveAsRule" value="1" />
                        Save as rule
                      </label>
                      <button
                        type="submit"
                        className="btn-secondary min-h-9 px-3 py-1 text-xs"
                      >
                        Save
                      </button>
                      {row.categorySource === "manual" && (
                        <span className="text-xs text-muted">
                          Manually corrected
                        </span>
                      )}
                    </form>
                  )}
                </td>
                <td className="td">
                  {row.parseError ? (
                    <span className="text-muted">Blocked</span>
                  ) : batch.committed ? (
                    <span>
                      {row.committedTransactionId ? "Committed" : "Skipped"}
                    </span>
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
                        className="btn-secondary min-h-9 px-3 py-1 text-xs"
                      >
                        {row.includeInCommit ? "Skip" : "Include"}
                      </button>
                    </form>
                  )}
                </td>
                <td className="td">
                  {row.parseError ? (
                    <span role="alert" className="font-medium text-warn-strong">
                      {row.parseError} — fix in a future CSV re-upload
                    </span>
                  ) : row.isDuplicate ? (
                    <span className="font-medium text-warn">
                      Likely duplicate — excluded by default
                    </span>
                  ) : (
                    <span className="text-muted">OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link href="/import" className="link-quiet">
        Import another file
      </Link>
    </main>
  );
}
