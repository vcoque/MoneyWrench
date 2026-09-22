"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { archiveAccount, createAccount } from "@/lib/accounts";
import { isAccountType } from "@/lib/account-types";

export type CreateAccountState = {
  error?: string;
};

export async function createAccountAction(
  _prevState: CreateAccountState,
  formData: FormData,
): Promise<CreateAccountState> {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route, but never
  // trust a client-supplied householdId — read it from the server session,
  // which is sourced from the DB (see lib/auth.config.ts). This also means
  // a user can only ever create an account in their OWN household.
  if (!session?.householdId) {
    return { error: "You must be logged in to create an account." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");

  if (!name) {
    return { error: "Account name is required." };
  }
  if (!isAccountType(type)) {
    return { error: "Invalid account type." };
  }

  await createAccount(session.householdId, name, type);
  revalidatePath("/accounts");
  return {};
}

/**
 * Plain (non-useActionState) server action for the per-row archive button —
 * archiving doesn't need pending/error UI beyond the list simply refreshing
 * without the archived row, so there's no client component/state needed
 * here, unlike account creation.
 */
export async function archiveAccountAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.householdId) {
    return;
  }

  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) {
    return;
  }

  // archiveAccount scopes its update by BOTH accountId and householdId, so
  // an account belonging to another household silently matches zero rows
  // rather than being archived — this is the actual cross-household guard,
  // not just this action reading session.householdId.
  await archiveAccount(session.householdId, accountId);
  revalidatePath("/accounts");
}
