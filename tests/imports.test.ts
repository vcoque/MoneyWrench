import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseCsvRows } from "@/lib/csv";
import { createCategory } from "@/lib/categories";
import { createCategoryRule } from "@/lib/category-rules";
import {
  applyCategoryRulesToBatch,
  commitImportBatch,
  createImportBatch,
  getImportBatch,
  setImportRowIncludeInCommit,
  updateImportRowCategory,
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

// Task 14: manual category correction (+ its interaction with Task 13's
// re-apply), per-row include/skip, commit-to-Transaction, and its
// household-scoping/double-commit guards.
describe("import row correction and commit (Task 14)", () => {
  const runId = `${Date.now()}-commit`;
  const householdId = `test-household-commit-${runId}`;
  const otherHouseholdId = `test-household-commit-other-${runId}`;
  const userId = `test-user-commit-${runId}`;
  const accountId = `test-account-commit-${runId}`;
  const otherAccountId = `test-account-commit-other-${runId}`;

  let coffeeCategoryId: string;
  let takeoutCategoryId: string;
  let streamingCategoryId: string;
  let otherCategoryId: string;

  const batchIds: string[] = [];

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Household Commit", currency: "USD" },
    });
    await db.household.create({
      data: { id: otherHouseholdId, name: "Other Household", currency: "USD" },
    });
    await db.user.create({
      data: {
        id: userId,
        householdId,
        email: `import-commit-${runId}@example.com`,
        name: "Commit User",
      },
    });
    await db.account.create({
      data: { id: accountId, householdId, name: "Checking", type: "checking" },
    });
    await db.account.create({
      data: {
        id: otherAccountId,
        householdId: otherHouseholdId,
        name: "Other Checking",
        type: "checking",
      },
    });

    coffeeCategoryId = (await createCategory(householdId, "Coffee", "expense")).id;
    takeoutCategoryId = (await createCategory(householdId, "Takeout", "expense")).id;
    streamingCategoryId = (await createCategory(householdId, "Streaming", "expense")).id;
    otherCategoryId = (
      await createCategory(otherHouseholdId, "Other Category", "expense")
    ).id;
  });

  afterAll(async () => {
    await db.transaction.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await db.importRow.deleteMany({
      where: { importBatchId: { in: batchIds } },
    });
    await db.importBatch.deleteMany({ where: { id: { in: batchIds } } });
    await db.categoryRule.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await db.category.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await db.account.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await db.user.deleteMany({ where: { householdId } });
    await db.household.deleteMany({
      where: { id: { in: [householdId, otherHouseholdId] } },
    });
  });

  const mapping = { dateColumn: 0, descriptionColumn: 1, amountColumn: 2 };

  it("a manual correction sets categorySource to manual and survives a subsequent re-apply, while uncorrected rows still re-evaluate normally", async () => {
    // A rule that would auto-match "STARBUCKS STORE #1" to Coffee.
    await createCategoryRule(householdId, {
      matchType: "contains",
      pattern: "starbucks",
      categoryId: coffeeCategoryId,
      priority: 1,
    });

    const csv = [
      "Date,Description,Amount",
      "2026-04-01,STARBUCKS STORE #1,-4.50",
      "2026-04-02,STARBUCKS STORE #2,-5.00",
    ].join("\n");
    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(householdId, accountId, userId, "reapply.csv", rows);
    batchIds.push(batch.id);

    const beforeCorrection = await getImportBatch(householdId, batch.id);
    const row1 = beforeCorrection!.rows.find((r) => r.rawDescription.endsWith("#1"))!;
    const row2 = beforeCorrection!.rows.find((r) => r.rawDescription.endsWith("#2"))!;
    expect(row1.categoryId).toBe(coffeeCategoryId);
    expect(row1.categorySource).toBe("auto");
    expect(row2.categoryId).toBe(coffeeCategoryId);
    expect(row2.categorySource).toBe("auto");

    // User manually corrects row1 to Takeout — a genuinely different
    // category from what the rule would produce, so a later re-apply
    // "winning" would be unambiguously detectable.
    const corrected = await updateImportRowCategory(householdId, row1.id, takeoutCategoryId);
    expect(corrected).not.toBeNull();
    expect(corrected!.categoryId).toBe(takeoutCategoryId);
    expect(corrected!.categorySource).toBe("manual");

    // Someone (or this same user) clicks "Re-apply category rules" — the
    // exact scenario Task 13's reviewer flagged: this must NOT clobber
    // row1's manual correction back to Coffee.
    const applied = await applyCategoryRulesToBatch(householdId, batch.id);
    expect(applied).toBe(true);

    const afterReapply = await getImportBatch(householdId, batch.id);
    const row1After = afterReapply!.rows.find((r) => r.id === row1.id)!;
    const row2After = afterReapply!.rows.find((r) => r.id === row2.id)!;

    // The manual correction survived.
    expect(row1After.categoryId).toBe(takeoutCategoryId);
    expect(row1After.categorySource).toBe("manual");
    // The uncorrected sibling row is still re-evaluated normally (proves
    // the skip is selective to manual rows, not a global no-op).
    expect(row2After.categoryId).toBe(coffeeCategoryId);
    expect(row2After.categorySource).toBe("auto");
  });

  it("updateImportRowCategory allows clearing a row back to uncategorized", async () => {
    const csv = ["Date,Description,Amount", "2026-04-05,Misc,-1.00"].join("\n");
    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(householdId, accountId, userId, "clear.csv", rows);
    batchIds.push(batch.id);

    const before = await getImportBatch(householdId, batch.id);
    const row = before!.rows[0];

    const set = await updateImportRowCategory(householdId, row.id, coffeeCategoryId);
    expect(set!.categoryId).toBe(coffeeCategoryId);

    const cleared = await updateImportRowCategory(householdId, row.id, null);
    expect(cleared).not.toBeNull();
    expect(cleared!.categoryId).toBeNull();
    expect(cleared!.categorySource).toBe("manual");
  });

  it("updateImportRowCategory refuses a row belonging to another household's batch", async () => {
    const csv = ["Date,Description,Amount", "2026-04-06,Other HH Row,-1.00"].join("\n");
    const rows = parseCsvRows(csv, mapping);
    const otherBatch = await createImportBatch(
      otherHouseholdId,
      otherAccountId,
      userId,
      "other-hh.csv",
      rows,
    );
    batchIds.push(otherBatch.id);
    const otherBatchFetched = await getImportBatch(otherHouseholdId, otherBatch.id);
    const otherRow = otherBatchFetched!.rows[0];

    const result = await updateImportRowCategory(householdId, otherRow.id, coffeeCategoryId);
    expect(result).toBeNull();

    const stillUntouched = await db.importRow.findUniqueOrThrow({
      where: { id: otherRow.id },
    });
    expect(stillUntouched.categoryId).toBeNull();
    expect(stillUntouched.categorySource).toBe("auto");
  });

  it("updateImportRowCategory refuses a categoryId belonging to another household", async () => {
    const csv = ["Date,Description,Amount", "2026-04-07,Cross HH Category,-1.00"].join("\n");
    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(householdId, accountId, userId, "cross-cat.csv", rows);
    batchIds.push(batch.id);
    const fetched = await getImportBatch(householdId, batch.id);
    const row = fetched!.rows[0];

    const result = await updateImportRowCategory(householdId, row.id, otherCategoryId);
    expect(result).toBeNull();

    const stillUntouched = await db.importRow.findUniqueOrThrow({ where: { id: row.id } });
    expect(stillUntouched.categoryId).toBeNull();
  });

  it("setImportRowIncludeInCommit toggles the flag, but refuses to touch a row with a parseError", async () => {
    const csv = [
      "Date,Description,Amount",
      "2026-04-08,Good Row,-1.00",
      "garbled-date,Bad Row,-1.00",
    ].join("\n");
    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(householdId, accountId, userId, "toggle.csv", rows);
    batchIds.push(batch.id);
    const fetched = await getImportBatch(householdId, batch.id);
    const goodRow = fetched!.rows.find((r) => r.rawDescription === "Good Row")!;
    const badRow = fetched!.rows.find((r) => r.rawDescription === "Bad Row")!;

    const toggled = await setImportRowIncludeInCommit(householdId, goodRow.id, false);
    expect(toggled).toBe(true);
    const goodRowAfter = await db.importRow.findUniqueOrThrow({ where: { id: goodRow.id } });
    expect(goodRowAfter.includeInCommit).toBe(false);

    // A blocked (parseError) row can never become a valid Transaction —
    // this must refuse to set includeInCommit on it at all, distinct from
    // a deliberate skip.
    const blockedToggle = await setImportRowIncludeInCommit(householdId, badRow.id, true);
    expect(blockedToggle).toBe(false);
    const badRowAfter = await db.importRow.findUniqueOrThrow({ where: { id: badRow.id } });
    expect(badRowAfter.includeInCommit).toBe(true); // schema default, untouched
  });

  it("commitImportBatch creates one Transaction per included/non-errored row, excludes skipped and blocked rows, allows a null category, derives type/amount from the signed parsedAmount, and links committedTransactionId", async () => {
    const csv = [
      "Date,Description,Amount",
      "2026-04-10,Coffee Shop,-4.50",
      "2026-04-11,Paycheck,2000.00",
      "2026-04-12,Skip Me,-9.99",
      "garbled-date,Bad Row,10.00",
    ].join("\n");
    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(householdId, accountId, userId, "commit.csv", rows);
    batchIds.push(batch.id);

    const staged = await getImportBatch(householdId, batch.id);
    const coffeeRow = staged!.rows.find((r) => r.rawDescription === "Coffee Shop")!;
    const paycheckRow = staged!.rows.find((r) => r.rawDescription === "Paycheck")!;
    const skipRow = staged!.rows.find((r) => r.rawDescription === "Skip Me")!;

    // Categorize the coffee row manually; deliberately leave the paycheck
    // row uncategorized (ruling: nullable categoryId is committable).
    await updateImportRowCategory(householdId, coffeeRow.id, coffeeCategoryId);
    // Explicitly skip one otherwise-valid row.
    await setImportRowIncludeInCommit(householdId, skipRow.id, false);

    const beforeCount = await db.transaction.count({ where: { importBatchId: batch.id } });
    expect(beforeCount).toBe(0);

    const result = await commitImportBatch(householdId, batch.id, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.transactionCount).toBe(2);

    const created = await db.transaction.findMany({
      where: { importBatchId: batch.id },
      orderBy: { description: "asc" },
    });
    expect(created).toHaveLength(2);

    const coffeeTxn = created.find((t) => t.description === "Coffee Shop")!;
    expect(coffeeTxn.type).toBe("expense");
    expect(Number(coffeeTxn.amount)).toBe(4.5);
    expect(coffeeTxn.categoryId).toBe(coffeeCategoryId);
    expect(coffeeTxn.source).toBe("import");
    expect(coffeeTxn.accountId).toBe(accountId);
    expect(coffeeTxn.householdId).toBe(householdId);
    expect(coffeeTxn.importBatchId).toBe(batch.id);
    expect(coffeeTxn.createdByUserId).toBe(userId);

    const paycheckTxn = created.find((t) => t.description === "Paycheck")!;
    expect(paycheckTxn.type).toBe("income");
    expect(Number(paycheckTxn.amount)).toBe(2000);
    expect(paycheckTxn.categoryId).toBeNull();

    // Neither "Skip Me" nor "Bad Row" produced a Transaction.
    expect(created.some((t) => t.description === "Skip Me")).toBe(false);
    expect(created.some((t) => t.description === "Bad Row")).toBe(false);

    const finalBatch = await getImportBatch(householdId, batch.id);
    expect(finalBatch!.committed).toBe(true);

    const coffeeRowAfter = finalBatch!.rows.find((r) => r.id === coffeeRow.id)!;
    const paycheckRowAfter = finalBatch!.rows.find((r) => r.id === paycheckRow.id)!;
    const skipRowAfter = finalBatch!.rows.find((r) => r.id === skipRow.id)!;
    const badRowAfter = finalBatch!.rows.find((r) => r.rawDescription === "Bad Row")!;

    expect(coffeeRowAfter.committedTransactionId).toBe(coffeeTxn.id);
    expect(paycheckRowAfter.committedTransactionId).toBe(paycheckTxn.id);
    expect(skipRowAfter.committedTransactionId).toBeNull();
    expect(badRowAfter.committedTransactionId).toBeNull();
  });

  it("a second commit attempt on an already-committed batch creates no duplicate transactions", async () => {
    const csv = ["Date,Description,Amount", "2026-04-15,Single Row,-1.00"].join("\n");
    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(
      householdId,
      accountId,
      userId,
      "double-commit.csv",
      rows,
    );
    batchIds.push(batch.id);

    const first = await commitImportBatch(householdId, batch.id, userId);
    expect(first.ok).toBe(true);

    const countAfterFirst = await db.transaction.count({ where: { importBatchId: batch.id } });
    expect(countAfterFirst).toBe(1);

    const second = await commitImportBatch(householdId, batch.id, userId);
    expect(second.ok).toBe(false);

    const countAfterSecond = await db.transaction.count({ where: { importBatchId: batch.id } });
    // The real proof: row count unchanged, not just "second call didn't throw".
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("two concurrent commit attempts on the same batch never produce duplicate transactions (atomicity guard)", async () => {
    const csv = [
      "Date,Description,Amount",
      "2026-04-16,Race Row A,-1.00",
      "2026-04-16,Race Row B,-2.00",
    ].join("\n");
    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(householdId, accountId, userId, "race.csv", rows);
    batchIds.push(batch.id);

    const [resultA, resultB] = await Promise.all([
      commitImportBatch(householdId, batch.id, userId),
      commitImportBatch(householdId, batch.id, userId),
    ]);

    const results = [resultA, resultB];
    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    // Exactly one of the two racing calls actually commits.
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const finalCount = await db.transaction.count({ where: { importBatchId: batch.id } });
    // Two eligible rows in this batch — never 4 (which a broken guard would
    // produce if both racing calls' creates were kept).
    expect(finalCount).toBe(2);

    const finalBatch = await getImportBatch(householdId, batch.id);
    expect(finalBatch!.committed).toBe(true);
  });

  it("commitImportBatch refuses a batch belonging to another household and creates nothing", async () => {
    const csv = ["Date,Description,Amount", "2026-04-17,Other HH Commit Row,-1.00"].join("\n");
    const rows = parseCsvRows(csv, mapping);
    const otherBatch = await createImportBatch(
      otherHouseholdId,
      otherAccountId,
      userId,
      "other-hh-commit.csv",
      rows,
    );
    batchIds.push(otherBatch.id);

    const result = await commitImportBatch(householdId, otherBatch.id, userId);
    expect(result.ok).toBe(false);

    const created = await db.transaction.count({ where: { importBatchId: otherBatch.id } });
    expect(created).toBe(0);

    const stillUncommitted = await getImportBatch(otherHouseholdId, otherBatch.id);
    expect(stillUncommitted!.committed).toBe(false);
  });

  it("saving a correction as a rule creates a CategoryRule that auto-categorizes future rows with the same exact description", async () => {
    const csv = ["Date,Description,Amount", "2026-04-20,Netflix Subscription,-15.99"].join("\n");
    const rows = parseCsvRows(csv, mapping);
    const batch = await createImportBatch(householdId, accountId, userId, "save-rule.csv", rows);
    batchIds.push(batch.id);

    const staged = await getImportBatch(householdId, batch.id);
    const row = staged!.rows[0];
    expect(row.categoryId).toBeNull(); // no rule matches it yet

    // What correctImportRowCategoryAction does when "save as rule" is
    // checked: correct the row, then create an exact-match rule from it.
    const corrected = await updateImportRowCategory(householdId, row.id, streamingCategoryId);
    expect(corrected).not.toBeNull();
    const rule = await createCategoryRule(householdId, {
      matchType: "exact",
      pattern: corrected!.rawDescription,
      categoryId: streamingCategoryId,
      priority: 0,
    });

    expect(rule.matchType).toBe("exact");
    expect(rule.pattern).toBe("Netflix Subscription");
    expect(rule.categoryId).toBe(streamingCategoryId);
    expect(rule.priority).toBe(0);

    // End-to-end proof it's actually useful: a brand new batch containing a
    // row with the identical raw description auto-categorizes on creation.
    const csv2 = [
      "Date,Description,Amount",
      "2026-05-01,Netflix Subscription,-15.99",
    ].join("\n");
    const rows2 = parseCsvRows(csv2, mapping);
    const batch2 = await createImportBatch(
      householdId,
      accountId,
      userId,
      "save-rule-2.csv",
      rows2,
    );
    batchIds.push(batch2.id);

    const staged2 = await getImportBatch(householdId, batch2.id);
    expect(staged2!.rows[0].categoryId).toBe(streamingCategoryId);
    // This new row was auto-categorized by the saved rule, not manually
    // corrected — its categorySource must be "auto".
    expect(staged2!.rows[0].categorySource).toBe("auto");
  });
});
