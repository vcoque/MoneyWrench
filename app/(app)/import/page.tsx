import { auth } from "@/lib/auth";
import { listAccounts } from "@/lib/accounts";
import ImportWizard from "./ImportWizard";

export default async function ImportPage() {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route, but the
  // query below still only ever uses the server-verified
  // session.householdId — never a client-supplied value.
  if (!session?.householdId) {
    return null;
  }

  const accounts = await listAccounts(session.householdId);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Import transactions</h1>
        <p className="page-lede">
          Upload a CSV export from your bank, map its columns, and review a
          preview before anything is saved as a transaction.
        </p>
      </div>

      {accounts.length === 0 ? (
        <p className="hint">Add an account first before importing a CSV.</p>
      ) : (
        <ImportWizard
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
          }))}
        />
      )}
    </main>
  );
}
