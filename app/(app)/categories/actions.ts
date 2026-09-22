"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { archiveCategory, createCategory } from "@/lib/categories";

export type CreateCategoryState = {
  error?: string;
};

export async function createCategoryAction(
  _prevState: CreateCategoryState,
  formData: FormData,
): Promise<CreateCategoryState> {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route, but never
  // trust a client-supplied householdId — read it from the server session,
  // which is sourced from the DB (see lib/auth.config.ts). This also means
  // a user can only ever create a category in their OWN household.
  if (!session?.householdId) {
    return { error: "You must be logged in to create a category." };
  }

  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Category name is required." };
  }

  // This UI only ever creates expense categories — savings_goal-kind
  // categories are created by a future task (alongside SavingsGoal
  // creation), which calls createCategory directly with kind
  // "savings_goal" and a savingsGoalId. No kind selector here.
  await createCategory(session.householdId, name, "expense");
  revalidatePath("/categories");
  return {};
}

/**
 * Plain (non-useActionState) server action for the per-row archive button —
 * archiving doesn't need pending/error UI beyond the list simply refreshing
 * without the archived row, so there's no client component/state needed
 * here, unlike category creation.
 */
export async function archiveCategoryAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.householdId) {
    return;
  }

  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) {
    return;
  }

  // archiveCategory scopes its update by BOTH categoryId and householdId, so
  // a category belonging to another household silently matches zero rows
  // rather than being archived — this is the actual cross-household guard,
  // not just this action reading session.householdId.
  await archiveCategory(session.householdId, categoryId);
  revalidatePath("/categories");
}
