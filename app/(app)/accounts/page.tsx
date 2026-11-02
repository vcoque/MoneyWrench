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
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Accounts</h1>
        <p className="page-lede">
          Add and manage the accounts your household tracks transactions in.
        </p>
      </div>

      <AccountForm />

      <div className="panel">
        <h2 className="panel-title">Existing accounts</h2>

        {accounts.length === 0 ? (
          <p className="hint">No accounts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="row-card flex-row items-center justify-between"
              >
                <span>
                  {account.name}{" "}
                  <span className="text-muted">
                    ({ACCOUNT_TYPE_LABELS[account.type]})
                  </span>
                </span>
                <form action={archiveAccountAction}>
                  <input type="hidden" name="accountId" value={account.id} />
                  <button type="submit" className="link-danger">
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
