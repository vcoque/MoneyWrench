import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
  type TransactionInput,
} from "@/lib/transactions";

// Integration test against the real Postgres container (moneywrench-pg),
// following the same pattern tests/accounts.test.ts and
// tests/categories.test.ts established: create real rows across two
// households, then assert that queries/mutations scoped to household A's
// session never see or affect household B's transactions. Also proves the
// source:"manual" guard (Task 8's controller ruling) and the filter
// behavior (account/category/month) against real DB data.
//
// Uses unique per-run ids (Date.now()-suffixed) so repeated local runs
// don't collide with leftover rows, and cleans up everything it creates in
// `afterAll`.

describe("transactions household scoping and CRUD", () => {
  const runId = Date.now().toString();
  const householdAId = `test-household-a-${runId}`;
  const householdBId = `test-household-b-${runId}`;
  const userAId = `test-user-a-${runId}`;
  const userBId = `test-user-b-${runId}`;
  const accountAId = `test-account-a-${runId}`;
  const accountA2Id = `test-account-a2-${runId}`;
  const accountBId = `test-account-b-${runId}`;
  const categoryAId = `test-category-a-${runId}`;
  const categoryA2Id = `test-category-a2-${runId}`;
  const categoryBId = `test-category-b-${runId}`;

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
        email: `txn-user-a-${runId}@example.com`,
        name: "User A",
      },
    });
    await db.user.create({
      data: {
        id: userBId,
        householdId: householdBId,
        email: `txn-user-b-${runId}@example.com`,
        name: "User B",
      },
    });

    await db.account.create({
      data: {
        id: accountAId,
        householdId: householdAId,
        name: "A Checking",
        type: "checking",
      },
    });
    await db.account.create({
      data: {
        id: accountA2Id,
        householdId: householdAId,
        name: "A Savings",
        type: "savings",
      },
    });
    await db.account.create({
      data: {
        id: accountBId,
        householdId: householdBId,
        name: "B Checking",
        type: "checking",
      },
    });

    await db.category.create({
      data: {
        id: categoryAId,
        householdId: householdAId,
        name: "Groceries",
        kind: "expense",
      },
    });
    await db.category.create({
      data: {
        id: categoryA2Id,
        householdId: householdAId,
        name: "Dining",
        kind: "expense",
      },
    });
    await db.category.create({
      data: {
        id: categoryBId,
        householdId: householdBId,
        name: "Utilities",
        kind: "expense",
      },
    });
  });

  afterAll(async () => {
    await db.transaction.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.category.deleteMany({
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

  function baseInput(overrides: Partial<TransactionInput> = {}): TransactionInput {
    return {
      accountId: accountAId,
      categoryId: categoryAId,
      date: new Date("2026-03-15T00:00:00.000Z"),
      amount: "42.50",
      type: "expense",
      description: "Weekly groceries",
      ...overrides,
    };
  }

  it("does not let household A see household B's transactions in its list", async () => {
    const transactionA = await createTransaction(
      householdAId,
      userAId,
      baseInput(),
    );
    const transactionB = await createTransaction(
      householdBId,
      userBId,
      baseInput({
        accountId: accountBId,
        categoryId: categoryBId,
        description: "B's transaction",
      }),
    );

    const householdATransactions = await listTransactions(householdAId);
    const householdBTransactions = await listTransactions(householdBId);

    expect(householdATransactions.map((t) => t.id)).toContain(transactionA.id);
    expect(householdATransactions.map((t) => t.id)).not.toContain(
      transactionB.id,
    );

    expect(householdBTransactions.map((t) => t.id)).toContain(transactionB.id);
    expect(householdBTransactions.map((t) => t.id)).not.toContain(
      transactionA.id,
    );

    // Cleanup this test's own rows so later tests' list assertions aren't
    // polluted.
    await db.transaction.deleteMany({
      where: { id: { in: [transactionA.id, transactionB.id] } },
    });
  });

  it("does not let household A update household B's transaction", async () => {
    const transactionB = await createTransaction(
      householdBId,
      userBId,
      baseInput({
        accountId: accountBId,
        categoryId: categoryBId,
        description: "B's original description",
      }),
    );

    const updated = await updateTransaction(
      householdAId,
      transactionB.id,
      baseInput({ description: "Tampered by household A" }),
    );
    expect(updated).toBe(false);

    const stillThere = await db.transaction.findUniqueOrThrow({
      where: { id: transactionB.id },
    });
    expect(stillThere.description).toBe("B's original description");

    await db.transaction.delete({ where: { id: transactionB.id } });
  });

  it("does not let household A delete household B's transaction", async () => {
    const transactionB = await createTransaction(
      householdBId,
      userBId,
      baseInput({ accountId: accountBId, categoryId: categoryBId }),
    );

    const deleted = await deleteTransaction(householdAId, transactionB.id);
    expect(deleted).toBe(false);

    const stillThere = await db.transaction.findUnique({
      where: { id: transactionB.id },
    });
    expect(stillThere).not.toBeNull();

    await db.transaction.delete({ where: { id: transactionB.id } });
  });

  it("updateTransaction and deleteTransaction refuse to touch a non-manual (imported) transaction", async () => {
    // Minimal imported-transaction fixture created directly via Prisma,
    // since import UI/data-access doesn't exist yet (a later task) — this
    // only proves the source:"manual" guard on the update/delete path.
    const imported = await db.transaction.create({
      data: {
        householdId: householdAId,
        accountId: accountAId,
        categoryId: categoryAId,
        date: new Date("2026-03-10T00:00:00.000Z"),
        amount: "10.00",
        type: "expense",
        description: "Imported transaction",
        source: "import",
        createdByUserId: userAId,
      },
    });

    const updated = await updateTransaction(
      householdAId,
      imported.id,
      baseInput({ description: "Should not apply" }),
    );
    expect(updated).toBe(false);

    const deleted = await deleteTransaction(householdAId, imported.id);
    expect(deleted).toBe(false);

    const stillThere = await db.transaction.findUniqueOrThrow({
      where: { id: imported.id },
    });
    expect(stillThere.description).toBe("Imported transaction");
    expect(stillThere.source).toBe("import");

    await db.transaction.delete({ where: { id: imported.id } });
  });

  it("edit updates the right row within the owning household", async () => {
    const transaction = await createTransaction(
      householdAId,
      userAId,
      baseInput({ description: "Original description", amount: "10.00" }),
    );
    const other = await createTransaction(
      householdAId,
      userAId,
      baseInput({ description: "Untouched sibling", amount: "20.00" }),
    );

    const updated = await updateTransaction(
      householdAId,
      transaction.id,
      baseInput({
        accountId: accountA2Id,
        categoryId: categoryA2Id,
        description: "Updated description",
        amount: "99.99",
        type: "income",
      }),
    );
    expect(updated).toBe(true);

    const row = await db.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
    });
    expect(row.description).toBe("Updated description");
    expect(row.amount.toString()).toBe("99.99");
    expect(row.type).toBe("income");
    expect(row.accountId).toBe(accountA2Id);
    expect(row.categoryId).toBe(categoryA2Id);

    // The sibling row is untouched.
    const otherRow = await db.transaction.findUniqueOrThrow({
      where: { id: other.id },
    });
    expect(otherRow.description).toBe("Untouched sibling");
    // Compare numerically rather than via exact string — Postgres numeric
    // (no fixed scale on this column) may not echo back trailing zeros.
    expect(Number(otherRow.amount)).toBe(20);

    await db.transaction.deleteMany({
      where: { id: { in: [transaction.id, other.id] } },
    });
  });

  it("delete actually removes the row from the database", async () => {
    const transaction = await createTransaction(householdAId, userAId, baseInput());

    const deleted = await deleteTransaction(householdAId, transaction.id);
    expect(deleted).toBe(true);

    const row = await db.transaction.findUnique({
      where: { id: transaction.id },
    });
    expect(row).toBeNull();
  });

  describe("filtering", () => {
    const filterTxnIds: string[] = [];

    beforeAll(async () => {
      const marchGroceriesChecking = await createTransaction(
        householdAId,
        userAId,
        baseInput({
          accountId: accountAId,
          categoryId: categoryAId,
          date: new Date("2026-03-05T00:00:00.000Z"),
          description: "March groceries (checking)",
        }),
      );
      const marchDiningSavings = await createTransaction(
        householdAId,
        userAId,
        baseInput({
          accountId: accountA2Id,
          categoryId: categoryA2Id,
          date: new Date("2026-03-20T00:00:00.000Z"),
          description: "March dining (savings)",
        }),
      );
      const aprilGroceriesChecking = await createTransaction(
        householdAId,
        userAId,
        baseInput({
          accountId: accountAId,
          categoryId: categoryAId,
          date: new Date("2026-04-02T00:00:00.000Z"),
          description: "April groceries (checking)",
        }),
      );
      filterTxnIds.push(
        marchGroceriesChecking.id,
        marchDiningSavings.id,
        aprilGroceriesChecking.id,
      );
    });

    afterAll(async () => {
      await db.transaction.deleteMany({ where: { id: { in: filterTxnIds } } });
    });

    it("filters by accountId", async () => {
      const results = await listTransactions(householdAId, {
        accountId: accountAId,
      });
      const descriptions = results.map((t) => t.description);
      expect(descriptions).toContain("March groceries (checking)");
      expect(descriptions).toContain("April groceries (checking)");
      expect(descriptions).not.toContain("March dining (savings)");
    });

    it("filters by categoryId", async () => {
      const results = await listTransactions(householdAId, {
        categoryId: categoryA2Id,
      });
      const descriptions = results.map((t) => t.description);
      expect(descriptions).toContain("March dining (savings)");
      expect(descriptions).not.toContain("March groceries (checking)");
      expect(descriptions).not.toContain("April groceries (checking)");
    });

    it("filters by month", async () => {
      const results = await listTransactions(householdAId, {
        month: "2026-03",
      });
      const descriptions = results.map((t) => t.description);
      expect(descriptions).toContain("March groceries (checking)");
      expect(descriptions).toContain("March dining (savings)");
      expect(descriptions).not.toContain("April groceries (checking)");
    });

    it("combines filters (account + month)", async () => {
      const results = await listTransactions(householdAId, {
        accountId: accountAId,
        month: "2026-04",
      });
      const descriptions = results.map((t) => t.description);
      expect(descriptions).toEqual(["April groceries (checking)"]);
    });

    it("includes account and category names for list rendering", async () => {
      const results = await listTransactions(householdAId, {
        accountId: accountAId,
        month: "2026-03",
      });
      expect(results).toHaveLength(1);
      expect(results[0].account.name).toBe("A Checking");
      expect(results[0].category?.name).toBe("Groceries");
    });
  });
});
