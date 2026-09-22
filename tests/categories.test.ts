import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  archiveCategory,
  createCategory,
  listCategories,
} from "@/lib/categories";

// Integration test against the real Postgres container (moneywrench-pg),
// following the same pattern tests/accounts.test.ts established: create
// real rows across two households, then assert that queries/mutations
// scoped to household A's session never see or affect household B's
// categories. This is the concrete proof for this task's AC ("household
// scoping enforced (same as Task 6)") — not just an assumption.
//
// Uses unique per-run ids (Date.now()-suffixed) so repeated local runs
// don't collide with leftover rows, and cleans up everything it creates
// in `afterAll`.

describe("categories household scoping", () => {
  const runId = Date.now().toString();
  const householdAId = `test-household-a-${runId}`;
  const householdBId = `test-household-b-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdAId, name: "Household A", currency: "USD" },
    });
    await db.household.create({
      data: { id: householdBId, name: "Household B", currency: "USD" },
    });
  });

  afterAll(async () => {
    // Categories cascade-delete isn't configured (RESTRICT by default per
    // Task 5), so delete children before parents.
    await db.category.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.household.deleteMany({
      where: { id: { in: [householdAId, householdBId] } },
    });
  });

  it("does not let household A see household B's categories in its list", async () => {
    const categoryA = await createCategory(
      householdAId,
      "Groceries",
      "expense",
    );
    const categoryB = await createCategory(householdBId, "Dining", "expense");

    const householdACategories = await listCategories(householdAId);
    const householdBCategories = await listCategories(householdBId);

    expect(householdACategories.map((c) => c.id)).toContain(categoryA.id);
    expect(householdACategories.map((c) => c.id)).not.toContain(categoryB.id);

    expect(householdBCategories.map((c) => c.id)).toContain(categoryB.id);
    expect(householdBCategories.map((c) => c.id)).not.toContain(categoryA.id);
  });

  it("does not let household A archive household B's category", async () => {
    const categoryB = await createCategory(
      householdBId,
      "Utilities",
      "expense",
    );

    // Household A's session tries to archive a category it doesn't own.
    const archived = await archiveCategory(householdAId, categoryB.id);
    expect(archived).toBe(false);

    // The category is untouched: still exists, still non-archived, still
    // visible to its real household's list.
    const stillThere = await db.category.findUniqueOrThrow({
      where: { id: categoryB.id },
    });
    expect(stillThere.isArchived).toBe(false);

    const householdBCategories = await listCategories(householdBId);
    expect(householdBCategories.map((c) => c.id)).toContain(categoryB.id);
  });

  it("archiving within the owning household hides the category from the list but keeps the row", async () => {
    const category = await createCategory(
      householdAId,
      "To Archive",
      "expense",
    );

    const archived = await archiveCategory(householdAId, category.id);
    expect(archived).toBe(true);

    const categories = await listCategories(householdAId);
    expect(categories.map((c) => c.id)).not.toContain(category.id);

    // Soft delete only — the row itself still exists, flagged archived.
    const row = await db.category.findUniqueOrThrow({
      where: { id: category.id },
    });
    expect(row.isArchived).toBe(true);
  });

  it("createCategory supports savings_goal kind with a linked savingsGoalId, for future reuse by SavingsGoal creation", async () => {
    const savingsGoal = await db.savingsGoal.create({
      data: {
        householdId: householdAId,
        name: "Emergency Fund",
        targetAmount: "1000",
      },
    });

    const category = await createCategory(
      householdAId,
      "Emergency Fund",
      "savings_goal",
      savingsGoal.id,
    );

    expect(category.kind).toBe("savings_goal");
    expect(category.savingsGoalId).toBe(savingsGoal.id);

    // Cleanup: category before goal (FK).
    await db.category.delete({ where: { id: category.id } });
    await db.savingsGoal.delete({ where: { id: savingsGoal.id } });
  });
});

describe("archiving a category with existing transactions", () => {
  const runId = Date.now().toString();
  const householdId = `test-household-archive-${runId}`;
  const userId = `test-user-archive-${runId}`;
  const accountId = `test-account-archive-${runId}`;

  let categoryId: string;
  let transactionId: string;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Archive Household", currency: "USD" },
    });
    await db.user.create({
      data: {
        id: userId,
        householdId,
        email: `archive-test-${runId}@example.com`,
        name: "Archive Tester",
      },
    });
    await db.account.create({
      data: { id: accountId, householdId, name: "Checking", type: "checking" },
    });

    const category = await createCategory(householdId, "Groceries", "expense");
    categoryId = category.id;

    // Minimal Transaction fixture created directly via Prisma, since
    // transaction UI/data-access doesn't exist yet (that's a later task) —
    // this is only here to prove archiving a category doesn't orphan or
    // null out a real transaction's categoryId reference.
    const transaction = await db.transaction.create({
      data: {
        householdId,
        accountId,
        categoryId,
        date: new Date(),
        amount: "42.50",
        type: "expense",
        description: "Weekly groceries",
        source: "manual",
        createdByUserId: userId,
      },
    });
    transactionId = transaction.id;
  });

  afterAll(async () => {
    await db.transaction.deleteMany({ where: { householdId } });
    await db.category.deleteMany({ where: { householdId } });
    await db.account.deleteMany({ where: { householdId } });
    await db.user.deleteMany({ where: { householdId } });
    await db.household.deleteMany({ where: { id: householdId } });
  });

  it("archives the category (soft delete) without deleting the row or orphaning the transaction's categoryId", async () => {
    const archived = await archiveCategory(householdId, categoryId);
    expect(archived).toBe(true);

    // The category row still exists, just flagged archived — never hard
    // deleted, per this task's AC.
    const categoryRow = await db.category.findUniqueOrThrow({
      where: { id: categoryId },
    });
    expect(categoryRow.isArchived).toBe(true);

    // The transaction's categoryId reference is untouched — still points
    // at the now-archived category, not nulled out or orphaned.
    const transactionRow = await db.transaction.findUniqueOrThrow({
      where: { id: transactionId },
    });
    expect(transactionRow.categoryId).toBe(categoryId);
  });
});
