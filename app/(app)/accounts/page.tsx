import { auth } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import { ACCOUNT_TYPE_LABELS } from "@/lib/account-types";
import AccountForm from "./account-form";
import { archiveAccountAction } from "./actions";

export default async function AccountsPage() {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route (see
  // middleware.ts), but the query below still only ever uses the
  // server-verified session.householdId — never a client-supplied value.
  if (!session?.householdId) {
    return null;
  }

  const accounts = await listAccounts(session.householdId);

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-24">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Accounts
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Add and manage the accounts your household tracks transactions in.
        </p>
      </div>

      <AccountForm />

      <div className="flex w-full max-w-md flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Existing accounts
        </h2>

        {accounts.length === 0 ? (
          <p className="text-sm text-zinc-500">No accounts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              >
                <span>
                  {account.name}{" "}
                  <span className="text-zinc-500">
                    ({ACCOUNT_TYPE_LABELS[account.type]})
                  </span>
                </span>
                <form action={archiveAccountAction}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <button
                    type="submit"
                    className="text-red-600 underline hover:no-underline dark:text-red-400"
                  >
                    Archive
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
