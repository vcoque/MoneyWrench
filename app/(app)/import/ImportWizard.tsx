"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  analyzeCsvAction,
  createImportBatchAction,
  type AnalyzeCsvState,
  type CreateImportBatchState,
} from "./actions";

// Plain { id, name } shape, mirroring TransactionForm's SelectOption —
// never import Account from @prisma/client into a client component.
type SelectOption = { id: string; name: string };

// A "use server" file (./actions.ts) can only export async functions, so
// these initial-state constants live here instead — same pattern as
// AccountForm.tsx/TransactionForm.tsx's local `initialState`.
const initialAnalyzeState: AnalyzeCsvState = { step: "upload" };
const initialCreateState: CreateImportBatchState = {};

type ImportWizardProps = {
  accounts: SelectOption[];
};

/**
 * Two-step CSV import wizard, kept as a single client component with
 * step state driven by analyzeCsvAction's return value (per the task
 * brief: "single page with client-side step state ... your call, keep it
 * simple"). Step 1 (account + file) posts to analyzeCsvAction, which reads
 * the file server-side and returns the header row + a sample + the full
 * CSV text. Step 2 (re-)renders once that state comes back, letting the
 * user map columns; its form resubmits the full CSV text (as a hidden
 * field) alongside the mapping to createImportBatchAction, which parses the
 * whole file, stages it as ImportBatch/ImportRow rows, and redirects to the
 * preview page.
 */
export default function ImportWizard({ accounts }: ImportWizardProps) {
  const [analyzeState, analyzeFormAction, analyzePending] = useActionState(
    analyzeCsvAction,
    initialAnalyzeState,
  );
  const [createState, createFormAction, createPending] = useActionState(
    createImportBatchAction,
    initialCreateState,
  );

  if (analyzeState.step === "mapping") {
    const { accountId, filename, csvText, headers, sampleRows } = analyzeState;

    return (
      <form
        action={createFormAction}
        className="flex w-full max-w-2xl flex-col gap-3"
      >
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="filename" value={filename} />
        <input type="hidden" name="csvText" value={csvText} />

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {filename}: map each column to date, description, and amount.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ColumnSelect
            id="map-date"
            name="dateColumn"
            label="Date column"
            headers={headers}
          />
          <ColumnSelect
            id="map-description"
            name="descriptionColumn"
            label="Description column"
            headers={headers}
          />
          <ColumnSelect
            id="map-amount"
            name="amountColumn"
            label="Amount column"
            headers={headers}
          />
        </div>

        {sampleRows.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-zinc-300 dark:border-zinc-700">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-300 dark:border-zinc-700">
                  {headers.map((header, index) => (
                    <th key={index} className="px-2 py-1 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="border-b border-zinc-200 last:border-0 dark:border-zinc-800"
                  >
                    {headers.map((_, colIndex) => (
                      <td key={colIndex} className="px-2 py-1">
                        {row[colIndex] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createPending}
            className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {createPending ? "Importing…" : "Parse and preview"}
          </button>
          <Link
            href="/import"
            className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400"
          >
            Start over
          </Link>
        </div>

        {createState.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {createState.error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form
      action={analyzeFormAction}
      className="flex w-full max-w-md flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="import-account"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Account
        </label>
        <select
          id="import-account"
          name="accountId"
          required
          defaultValue=""
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="" disabled>
            Select an account
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="import-file"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          CSV file
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <button
        type="submit"
        disabled={analyzePending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-zinc-50 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {analyzePending ? "Reading…" : "Continue"}
      </button>

      {analyzeState.step === "upload" && analyzeState.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {analyzeState.error}
        </p>
      )}
    </form>
  );
}

type ColumnSelectProps = {
  id: string;
  name: string;
  label: string;
  headers: string[];
};

function ColumnSelect({ id, name, label, headers }: ColumnSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <select
        id={id}
        name={name}
        required
        defaultValue=""
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="" disabled>
          Select a column
        </option>
        {headers.map((header, index) => (
          <option key={index} value={index}>
            {header || `Column ${index + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
}
