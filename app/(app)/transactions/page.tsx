import { auth } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { listCategories } from "@/lib/categories";
import { listTransactions } from "@/lib/transactions";
import { TRANSACTION_TYPE_LABELS } from "@/lib/transaction-types";
import TransactionForm from "./TransactionForm";
import {
  createTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
} from "./actions";

type TransactionsPageProps = {
  searchParams: Promise<{
    accountId?: string;
    categoryId?: string;
    month?: string;
    edit?: string;
  }>;
};

/** Builds a "/transactions?..." href preserving the given filters, with `overrides` applied on top. */
function buildHref(
  filters: { accountId?: string; categoryId?: string; month?: string },
  overrides: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  const merged = { ...filters, ...overrides };
  if (merged.accountId) params.set("accountId", merged.accountId);
  if (merged.categoryId) params.set("categoryId", merged.categoryId);
  if (merged.month) params.set("month", merged.month);
  const query = params.toString();
  return query ? `/transactions?${query}` : "/transactions";
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route (see
  // middleware.ts), but every query below still only ever uses the
  // server-verified session.householdId — never a client-supplied value.
  if (!session?.householdId) {
    return null;
  }

  const params = await searchParams;
  const filters = {
    accountId: params.accountId || undefined,
    categoryId: params.categoryId || undefined,
    month: params.month || undefined,
  };

  const [accounts, categories, transactions] = await Promise.all([
    listAccounts(session.householdId),
    listCategories(session.householdId),
    listTransactions(session.householdId, filters),
  ]);

  const selectOptions = {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
  };

  // Editing is only ever offered for a transaction that's (a) in this
  // household's own list and (b) manually entered — `transactions` above is
  // already household-scoped, and source:"manual" is enforced for real by
  // updateTransactionAction/updateTransaction regardless of what this page
  // renders, but checking it here too means an imported transaction (once
  // Task 12+ exists) never even shows an edit form.
  const editingTransaction = params.edit
    ? transactions.find(
        (t) => t.id === params.edit && t.source === "manual",
      )
    : undefined;

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-24">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Transactions
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Log and manage your household&apos;s transactions.
        </p>
      </div>

      {editingTransaction ? (
        <div className="flex w-full max-w-md flex-col gap-2">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Edit transaction
          </h2>
          <TransactionForm
            action={updateTransactionAction}
            accounts={selectOptions.accounts}
            categories={selectOptions.categories}
            defaultValues={{
              id: editingTransaction.id,
              date: editingTransaction.date.toISOString().slice(0, 10),
              accountId: editingTransaction.accountId,
              amount: Number(editingTransaction.amount).toFixed(2),
              type: editingTransaction.type,
              description: editingTransaction.description,
              categoryId: editingTransaction.categoryId ?? "",
            }}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            onCancelHref={buildHref(filters, { edit: undefined })}
          />
        </div>
      ) : (
        <TransactionForm
          action={createTransactionAction}
          accounts={selectOptions.accounts}
          categories={selectOptions.categories}
          submitLabel="Add transaction"
          pendingLabel="Adding…"
        />
      )}

      <form
        method="get"
        className="flex w-full max-w-2xl flex-wrap items-end gap-3 rounded-md border border-zinc-300 p-3 dark:border-zinc-700"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-account"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Account
          </label>
          <select
            id="filter-account"
            name="accountId"
            defaultValue={filters.accountId ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All accounts</option>
            {selectOptions.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-category"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Category
          </label>
          <select
            id="filter-category"
            name="categoryId"
            defaultValue={filters.categoryId ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All categories</option>
            {selectOptions.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-month"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Month
          </label>
          <input
            id="filter-month"
            name="month"
            type="month"
            defaultValue={filters.month ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Apply filters
        </button>

        <a
          href="/transactions"
          className="text-sm text-zinc-600 underline hover:no-underline dark:text-zinc-400"
        >
          Clear filters
        </a>
      </form>

      <div className="flex w-full max-w-2xl flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {transactions.length}{" "}
          {transactions.length === 1 ? "transaction" : "transactions"}
        </h2>

        {transactions.length === 0 ? (
          <p className="text-sm text-zinc-500">No transactions found.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {transactions.map((transaction) => (
              <li
                key={transaction.id}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              >
                <div className="flex flex-col">
                  <span>
                    {transaction.date.toISOString().slice(0, 10)} —{" "}
                    {transaction.description}
                  </span>
                  <span className="text-zinc-500">
                    {transaction.account.name} ·{" "}
                    {transaction.category?.name ?? "Uncategorized"} ·{" "}
                    {TRANSACTION_TYPE_LABELS[transaction.type]}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-medium">
                    {transaction.type === "income" ? "+" : "-"}
                    {Number(transaction.amount).toFixed(2)}
                  </span>

                  {transaction.source === "manual" && (
                    <>
                      <a
                        href={buildHref(filters, { edit: transaction.id })}
                        className="text-zinc-600 underline hover:no-underline dark:text-zinc-400"
                      >
                        Edit
                      </a>
                      <form action={deleteTransactionAction}>
                        <input
                          type="hidden"
                          name="transactionId"
                          value={transaction.id}
                        />
                        <button
                          type="submit"
                          className="text-red-600 underline hover:no-underline dark:text-red-400"
                        >
                          Delete
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
