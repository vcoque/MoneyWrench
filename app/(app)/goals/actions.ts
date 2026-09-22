"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createGoal } from "@/lib/goals";

export type CreateGoalState = {
  error?: string;
};

export async function createGoalAction(
  _prevState: CreateGoalState,
  formData: FormData,
): Promise<CreateGoalState> {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route, but never
  // trust a client-supplied householdId — read it from the server session,
  // which is sourced from the DB (see lib/auth.config.ts). This also means
  // a user can only ever create a goal in their OWN household.
  if (!session?.householdId) {
    return { error: "You must be logged in to create a goal." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const targetAmountRaw = String(formData.get("targetAmount") ?? "").trim();

  if (!name) {
    return { error: "Goal name is required." };
  }

  // Same decimal validation shape as the transaction amount field
  // (app/(app)/transactions/actions.ts) — a positive number with up to 2
  // decimal places, passed through to Prisma's Decimal field as a string
  // to avoid float rounding issues.
  if (!/^\d+(\.\d{1,2})?$/.test(targetAmountRaw) || Number(targetAmountRaw) <= 0) {
    return {
      error: "Target amount must be a positive number (up to 2 decimals).",
    };
  }

  await createGoal(session.householdId, name, targetAmountRaw);
  revalidatePath("/goals");
  return {};
}
