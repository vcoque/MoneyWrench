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
    <main className="flex min-h-screen flex-col items-center gap-10 p-24">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Import transactions
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          Upload a CSV export from your bank, map its columns, and review a
          preview before anything is saved as a transaction.
        </p>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Add an account first before importing a CSV.
        </p>
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
