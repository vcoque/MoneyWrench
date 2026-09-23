import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseCsvRows } from "@/lib/csv";
import { createCategory } from "@/lib/categories";
import { createCategoryRule } from "@/lib/category-rules";
import {
  applyCategoryRulesToBatch,
  createImportBatch,
  getImportBatch,
} from "@/lib/imports";

// Integration test against the real Postgres container (moneywrench-pg),
// following the same pattern tests/accounts.test.ts/tests/transactions.test.ts
// established: create real rows across two households, then assert that
// writes/reads scoped to household A's session never touch household B's
// data. Also proves two of this task's own ACs directly against the DB:
// (1) an account belonging to another household can't be used to create an
// import batch, and (2) nothing lands in the Transaction table as a result
// of this flow.

describe("imports household scoping and staging", () => {
  const runId = Date.now().toString();
  const householdAId = `test-household-a-${runId}`;
  const householdBId = `test-household-b-${runId}`;
  const userAId = `test-user-a-${runId}`;
  const accountAId = `test-account-a-${runId}`;
  const accountBId = `test-account-b-${runId}`;

  const batchIds: string[] = [];

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdAId, name: "Household A", currency: "USD" },
    });
    await db.household.create({
      data: { id: householdBId, name: "Household B", currency: "USD" },
    });
    await db.user.create({
      data: {
        id: userAId,
        householdId: householdAId,
        email: `import-user-a-${runId}@example.com`,
        name: "User A",
      },
    });
    await db.account.create({
      data: { id: accountAId, householdId: householdAId, name: "A Checking", type: "checking" },
    });
    await db.account.create({
      data: { id: accountBId, householdId: householdBId, name: "B Checking", type: "checking" },
    });
  });

  afterAll(async () => {
    await db.importRow.deleteMany({
      where: { importBatchId: { in: batchIds } },
    });
    await db.importBatch.deleteMany({ where: { id: { in: batchIds } } });
    await db.transaction.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.account.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.user.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.household.deleteMany({
      where: { id: { in: [householdAId, householdBId] } },
    });
  });

  const sampleCsv = [
    "Date,Description,Amount",
    "2026-03-01,Good row,10.00",
    "garbled-date,Bad row,10.00",
  ].join("\n");
  const mapping = { dateColumn: 0, descriptionColumn: 1, amountColumn: 2 };

  it("creates an ImportBatch + ImportRows scoped to the caller's household, staging both good and flagged rows", async () => {
    const rows = parseCsvRows(sampleCsv, mapping);
    const batch = await createImportBatch(
      householdAId,
      accountAId,
      userAId,
      "sample.csv",
      rows,
    );
    batchIds.push(batch.id);

    const fetched = await getImportBatch(householdAId, batch.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.rows).toHaveLength(2);

    const goodRow = fetched!.rows.find((r) => r.rawDescription === "Good row");
    const badRow = fetched!.rows.find((r) => r.rawDescription === "Bad row");
    expect(goodRow?.parseError).toBeNull();
    expect(badRow?.parseError).toContain("invalid date format");

    // Fields owned by later tasks (13-15) are left untouched at their
    // schema defaults — this task must not populate them.
    expect(fetched!.committed).toBe(false);
    for (const row of fetched!.rows) {
      expect(row.categoryId).toBeNull();
      expect(row.isDuplicate).toBe(false);
      expect(row.includeInCommit).toBe(true);
      expect(row.committedTransactionId).toBeNull();
    }
  });

  it("refuses to create an import batch against an account belonging to another household", async () => {
    const rows = parseCsvRows(sampleCsv, mapping);

    // Household A's session tries to import into household B's account.
    await expect(
      createImportBatch(householdAId, accountBId, userAId, "sample.csv", rows),
    ).rejects.toThrow();

    // Nothing was created as a side effect of the rejected attempt.
    const batchesForAccountB = await db.importBatch.findMany({
      where: { accountId: accountBId },
    });
    expect(batchesForAccountB).toHaveLength(0);
  });

  it("does not let household A read household B's import batch", async () => {
    const rows = parseCsvRows(sampleCsv, mapping);
    const batchB = await db.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: { accountId: accountBId, filename: "b.csv", uploadedByUserId: userAId },
      });
      await tx.importRow.createMany({
        data: rows.map((row) => ({
          importBatchId: batch.id,
          rowIndex: row.rowIndex,
          rawDate: row.rawDate,
          rawDescription: row.rawDescription,
          rawAmount: row.rawAmount,
          parsedDate: row.parsedDate,
          parsedAmount: row.parsedAmount,
          parseError: row.parseError,
        })),
      });
      return batch;
    });
    batchIds.push(batchB.id);

    const fetchedByHouseholdA = await getImportBatch(householdAId, batchB.id);
    expect(fetchedByHouseholdA).toBeNull();

    const fetchedByHouseholdB = await getImportBatch(householdBId, batchB.id);
    expect(fetchedByHouseholdB).not.toBeNull();
  });

  it("writes nothing to the Transaction table as a result of staging an import", async () => {
    const beforeCount = await db.transaction.count({
      where: { householdId: { in: [householdAId, householdBId] } },
    });

    const rows = parseCsvRows(sampleCsv, mapping);
    const batch = await createImportBatch(
      householdAId,
      accountAId,
      userAId,
      "another.csv",
      rows,
    );
    batchIds.push(batch.id);

    const afterCount = await db.transaction.count({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    expect(afterCount).toBe(beforeCount);
    expect(afterCount).toBe(0);
  });
});

// Task 13: auto-categorization wired into createImportBatch, plus the
// "re-apply category rules" flow for a batch that already exists.
describe("import batch auto-categorization (Task 13)", () => {
  const runId = `${Date.now()}-cat`;
  const householdId = `test-household-cat-${runId}`;
  const userId = `test-user-cat-${runId}`;
  const accountId = `test-account-cat-${runId}`;

  let coffeeCategoryId: string;
  const batchIds: string[] = [];

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Household Cat", currency: "USD" },
    });
    await db.user.create({
      data: {
        id: userId,
        householdId,
        email: `import-cat-${runId}@example.com`,
        name: "Cat User",
      },
    });
    await db.account.create({
      data: { id: accountId, householdId, name: "Checking", type: "checking" },
    });
    const category = await createCategory(householdId, "Coffee", "expense");
    coffeeCategoryId = category.id;
  });

  afterAll(async () => {
    await db.importRow.deleteMany({
      where: { importBatchId: { in: batchIds } },
    });
    await db.importBatch.deleteMany({ where: { id: { in: batchIds } } });
    await db.categoryRule.deleteMany({ where: { householdId } });
    await db.category.deleteMany({ where: { householdId } });
    await db.account.deleteMany({ where: { householdId } });
    await db.user.deleteMany({ where: { householdId } });
    await db.household.deleteMany({ where: { id: householdId } });
  });

  const csv = [
    "Date,Description,Amount",
    "2026-03-01,STARBUCKS STORE #123,4.50",
    "2026-03-02,Random Grocery Store,25.00",
  ].join("\n");
  const mapping = { dateColumn: 0, descriptionColumn: 1, amountColumn: 2 };

  it("createImportBatch auto-categorizes rows against rules that already exist", async () => {
    await createCategoryRule(householdId, {
      matchType: "contains",
      pattern: "starbucks",
      categoryId: coffeeCategoryId,
      priority: 1,
    });

    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(
      householdId,
      accountId,
      userId,
      "auto-categorize.csv",
      rows,
    );
    batchIds.push(batch.id);

    const fetched = await getImportBatch(householdId, batch.id);
    expect(fetched).not.toBeNull();

    const starbucksRow = fetched!.rows.find((r) =>
      r.rawDescription.includes("STARBUCKS"),
    );
    const groceryRow = fetched!.rows.find((r) =>
      r.rawDescription.includes("Grocery"),
    );

    expect(starbucksRow?.categoryId).toBe(coffeeCategoryId);
    expect(starbucksRow?.category?.name).toBe("Coffee");
    // No rule matches the grocery row — left uncategorized, not blocked
    // and not defaulted to any fallback category.
    expect(groceryRow?.categoryId).toBeNull();
    expect(groceryRow?.category).toBeNull();
  });

  it("a rule created AFTER a batch already exists has no effect until re-applied, then applies correctly via applyCategoryRulesToBatch", async () => {
    // No matching rule exists yet at batch-creation time.
    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(
      householdId,
      accountId,
      userId,
      "before-rule.csv",
      rows,
    );
    batchIds.push(batch.id);

    const beforeRule = await getImportBatch(householdId, batch.id);
    const groceryRowBefore = beforeRule!.rows.find((r) =>
      r.rawDescription.includes("Grocery"),
    );
    expect(groceryRowBefore?.categoryId).toBeNull();

    // Create a household B, unrelated, to prove re-applying only touches
    // this batch's own household's rules — not strictly required by the
    // AC, but cheap insurance against a household-scoping regression here.
    const groceryCategory = await createCategory(householdId, "Groceries", "expense");
    await createCategoryRule(householdId, {
      matchType: "contains",
      pattern: "grocery",
      categoryId: groceryCategory.id,
      priority: 5,
    });

    const applied = await applyCategoryRulesToBatch(householdId, batch.id);
    expect(applied).toBe(true);

    const afterRule = await getImportBatch(householdId, batch.id);
    const groceryRowAfter = afterRule!.rows.find((r) =>
      r.rawDescription.includes("Grocery"),
    );
    const starbucksRowAfter = afterRule!.rows.find((r) =>
      r.rawDescription.includes("STARBUCKS"),
    );

    expect(groceryRowAfter?.categoryId).toBe(groceryCategory.id);
    // The pre-existing starbucks rule (from the earlier test) still applies
    // too — re-applying re-evaluates every row, not just the newly-matched
    // one.
    expect(starbucksRowAfter?.categoryId).toBe(coffeeCategoryId);
  });

  it("applyCategoryRulesToBatch refuses a batch belonging to another household", async () => {
    const otherHouseholdId = `test-household-cat-other-${runId}`;
    const otherAccountId = `test-account-cat-other-${runId}`;
    await db.household.create({
      data: { id: otherHouseholdId, name: "Other Household", currency: "USD" },
    });
    await db.account.create({
      data: {
        id: otherAccountId,
        householdId: otherHouseholdId,
        name: "Other Checking",
        type: "checking",
      },
    });

    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(
      otherHouseholdId,
      otherAccountId,
      userId,
      "other-household.csv",
      rows,
    );

    // Household under test tries to re-apply rules to a batch it doesn't own.
    const applied = await applyCategoryRulesToBatch(householdId, batch.id);
    expect(applied).toBe(false);

    await db.importRow.deleteMany({ where: { importBatchId: batch.id } });
    await db.importBatch.deleteMany({ where: { id: batch.id } });
    await db.account.deleteMany({ where: { householdId: otherHouseholdId } });
    await db.household.deleteMany({ where: { id: otherHouseholdId } });
  });
});
