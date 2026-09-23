"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { listCategories } from "@/lib/categories";
import {
  createCategoryRule,
  deleteCategoryRule,
  updateCategoryRule,
  type CategoryRuleInput,
} from "@/lib/category-rules";
import { isCategoryRuleMatchType } from "@/lib/category-rule-types";

export type CategoryRuleFormState = {
  error?: string;
};

/**
 * Parses + validates a rule form submission. Beyond basic field presence,
 * this also checks that the submitted categoryId actually belongs to the
 * caller's household — the <select> in CategoryRuleForm only ever lists
 * the household's own categories, but a tampered request could submit an
 * arbitrary id, mirroring parseTransactionForm's account/category check in
 * app/(app)/transactions/actions.ts. A regex matchType's pattern is also
 * compile-tested here (new RegExp(pattern)) so a rule with invalid regex
 * syntax is rejected at creation/edit time, rather than silently never
 * matching anything once saved (lib/categorize.ts still treats a malformed
 * pattern as a non-match rather than throwing, as defense in depth, but
 * catching it here gives the user an actual error message).
 */
type ParsedCategoryRuleForm =
  | { ok: true; data: CategoryRuleInput }
  | { ok: false; error: string };

async function parseCategoryRuleForm(
  formData: FormData,
  householdId: string,
): Promise<ParsedCategoryRuleForm> {
  const matchType = String(formData.get("matchType") ?? "");
  const pattern = String(formData.get("pattern") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const priorityRaw = String(formData.get("priority") ?? "").trim();

  if (!isCategoryRuleMatchType(matchType)) {
    return { ok: false, error: "Invalid match type." };
  }

  if (!pattern) {
    return { ok: false, error: "Pattern is required." };
  }

  if (matchType === "regex") {
    try {
      new RegExp(pattern);
    } catch {
      return { ok: false, error: "Invalid regular expression." };
    }
  }

  if (!categoryId) {
    return { ok: false, error: "Category is required." };
  }

  if (!/^-?\d+$/.test(priorityRaw)) {
    return { ok: false, error: "Priority must be a whole number." };
  }

  const categories = await listCategories(householdId);
  if (!categories.some((category) => category.id === categoryId)) {
    return { ok: false, error: "Invalid category." };
  }

  return {
    ok: true,
    data: { matchType, pattern, categoryId, priority: Number(priorityRaw) },
  };
}

export async function createCategoryRuleAction(
  _prevState: CategoryRuleFormState,
  formData: FormData,
): Promise<CategoryRuleFormState> {
  const session = await auth();

  // Belt-and-suspenders: middleware already protects this route, but never
  // trust a client-supplied householdId — read it from the server session,
  // which is sourced from the DB (see lib/auth.config.ts).
  if (!session?.householdId) {
    return { error: "You must be logged in to create a rule." };
  }

  const parsed = await parseCategoryRuleForm(formData, session.householdId);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  await createCategoryRule(session.householdId, parsed.data);
  revalidatePath("/rules");
  return {};
}

export async function updateCategoryRuleAction(
  _prevState: CategoryRuleFormState,
  formData: FormData,
): Promise<CategoryRuleFormState> {
  const session = await auth();
  if (!session?.householdId) {
    return { error: "You must be logged in to edit a rule." };
  }

  const ruleId = String(formData.get("ruleId") ?? "");
  if (!ruleId) {
    return { error: "Missing rule." };
  }

  const parsed = await parseCategoryRuleForm(formData, session.householdId);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  // updateCategoryRule scopes its update by id AND householdId, so a rule
  // belonging to another household silently matches zero rows rather than
  // being edited — the actual cross-household guard, not just this action
  // reading session.householdId.
  const updated = await updateCategoryRule(
    session.householdId,
    ruleId,
    parsed.data,
  );
  if (!updated) {
    return { error: "Rule not found." };
  }

  revalidatePath("/rules");
  return {};
}

/**
 * Plain (non-useActionState) server action for the per-row delete button —
 * mirrors deleteTransactionAction/archiveAccountAction: no pending/error UI
 * needed beyond the list simply refreshing without the deleted row.
 */
export async function deleteCategoryRuleAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.householdId) {
    return;
  }

  const ruleId = String(formData.get("ruleId") ?? "");
  if (!ruleId) {
    return;
  }

  // deleteCategoryRule scopes its delete by id AND householdId — the actual
  // cross-household guard, not just this action reading session.householdId.
  await deleteCategoryRule(session.householdId, ruleId);
  revalidatePath("/rules");
}
