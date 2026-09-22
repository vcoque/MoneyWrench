import type { Account, AccountType } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Lists non-archived accounts for a household, newest first. Callers MUST
 * pass a householdId sourced from the caller's own session (never client
 * input) — this function does no authorization check itself.
 */
export async function listAccounts(householdId: string): Promise<Account[]> {
  return db.account.findMany({
    where: { householdId, isArchived: false },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Creates an account in the given household. Callers MUST pass a
 * householdId sourced from the caller's own session (never client input).
 */
export async function createAccount(
  householdId: string,
  name: string,
  type: AccountType,
): Promise<Account> {
  return db.account.create({
    data: { householdId, name, type },
  });
}

/**
 * Archives an account by flagging it rather than deleting the row, so
 * Transaction/ImportBatch history referencing it stays intact (see the
 * design spec's Error Handling section). Scoped by householdId in the
 * `where` clause itself — an `updateMany` with both `id` and `householdId`
 * conditions is the actual cross-household guard: if the account belongs to
 * a different household, zero rows match and nothing is archived. Returns
 * whether an account was actually archived.
 */
export async function archiveAccount(
  householdId: string,
  accountId: string,
): Promise<boolean> {
  const result = await db.account.updateMany({
    where: { id: accountId, householdId },
    data: { isArchived: true },
  });
  return result.count === 1;
}
