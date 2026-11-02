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

        <p className="text-sm text-muted">
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
          <div className="table-wrap">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line">
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
                    className="border-b border-line last:border-0"
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
          <button type="submit" disabled={createPending} className="btn">
            {createPending ? "Importing…" : "Parse and preview"}
          </button>
          <Link href="/import" className="link-quiet">
            Start over
          </Link>
        </div>

        {createState.error && (
          <p role="alert" className="error-text">
            {createState.error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form action={analyzeFormAction} className="panel">
      <div className="flex flex-col gap-1">
        <label htmlFor="import-account" className="label">
          Account
        </label>
        <select
          id="import-account"
          name="accountId"
          required
          defaultValue=""
          className="input"
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
        <label htmlFor="import-file" className="label">
          CSV file
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="input"
        />
      </div>

      <button type="submit" disabled={analyzePending} className="btn">
        {analyzePending ? "Reading…" : "Continue"}
      </button>

      {analyzeState.step === "upload" && analyzeState.error && (
        <p role="alert" className="error-text">
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
      <label htmlFor={id} className="label">
        {label}
      </label>
      <select id={id} name={name} required defaultValue="" className="input">
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
