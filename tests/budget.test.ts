import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCategory } from "@/lib/categories";
import { createTransaction } from "@/lib/transactions";
import { getOrCreateBudgetPeriod, setAllocation } from "@/lib/budgets";
import { getBudgetDashboard } from "@/lib/budget";

// Integration tests against the real Postgres container (moneywrench-pg),
// following the same pattern as tests/budgets.test.ts and
// tests/transactions.test.ts: create real rows, assert against actual
// queries, clean up in afterAll. Uses unique per-run ids so repeated local
// runs don't collide with leftover rows.

describe("getBudgetDashboard: per-category planned vs actual", () => {
  const runId = Date.now().toString();
  const householdId = `test-household-dash-${runId}`;
  const userId = `test-user-dash-${runId}`;
  const accountId = `test-account-dash-${runId}`;

  let groceriesId: string;
  let diningId: string;
  let impulseId: string;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Dashboard Household", currency: "USD" },
    });
    await db.user.create({
      data: {
        id: userId,
        householdId,
        email: `dash-user-${runId}@example.com`,
        name: "Dash User",
      },
    });
    await db.account.create({
      data: { id: accountId, householdId, name: "Checking", type: "checking" },
    });

    const groceries = await createCategory(householdId, "Groceries", "expense");
    const dining = await createCategory(householdId, "Dining", "expense");
    const impulse = await createCategory(householdId, "Impulse", "expense");
    groceriesId = groceries.id;
    diningId = dining.id;
    impulseId = impulse.id;

    const period = await getOrCreateBudgetPeriod(
      householdId,
      2026,
      8,
      "1000.00",
      "spend_limit",
    );

    // Groceries: planned $300, actual $310 (two transactions) -> OVER.
    await setAllocation(householdId, period.id, groceriesId, "300.00");
    await createTransaction(householdId, userId, {
      accountId,
      categoryId: groceriesId,
      date: new Date("2026-08-05T00:00:00.000Z"),
      amount: "250.00",
      type: "expense",
      description: "Groceries week 1",
    });
    await createTransaction(householdId, userId, {
      accountId,
      categoryId: groceriesId,
      date: new Date("2026-08-20T00:00:00.000Z"),
      amount: "60.00",
      type: "expense",
      description: "Groceries week 3",
    });

    // Dining: planned $100, zero actual transactions -> UNDER, actual "0".
    await setAllocation(householdId, period.id, diningId, "100.00");

    // Impulse: no allocation this period, but $75 of actual spend ->
    // "actual but no allocation" edge case. Must still appear on the
    // dashboard (unplanned spending the user should see).
    await createTransaction(householdId, userId, {
      accountId,
      categoryId: impulseId,
      date: new Date("2026-08-10T00:00:00.000Z"),
      amount: "75.00",
      type: "expense",
      description: "Impulse buy",
    });

    // Out-of-period transaction (July, not August) — proves date-range
    // scoping excludes it from both the category row and the overall sum.
    await createTransaction(householdId, userId, {
      accountId,
      categoryId: groceriesId,
      date: new Date("2026-07-31T23:00:00.000Z"),
      amount: "999.00",
      type: "expense",
      description: "Should not count (July)",
    });

    // Uncategorized transaction in-period — must count toward the OVERALL
    // total (per the controller ruling: overall actual is a sum across ALL
    // household transactions this period, including uncategorized ones) but
    // must NOT produce a category row of its own.
    await createTransaction(householdId, userId, {
      accountId,
      categoryId: null,
      date: new Date("2026-08-12T00:00:00.000Z"),
      amount: "40.00",
      type: "expense",
      description: "Uncategorized spend",
    });
  });

  afterAll(async () => {
    await db.transaction.deleteMany({ where: { householdId } });
    await db.budgetAllocation.deleteMany({
      where: { budgetPeriod: { householdId } },
    });
    await db.budgetPeriod.deleteMany({ where: { householdId } });
    await db.category.deleteMany({ where: { householdId } });
    await db.account.deleteMany({ where: { householdId } });
    await db.user.deleteMany({ where: { householdId } });
    await db.household.deleteMany({ where: { id: householdId } });
  });

  it("computes planned vs. actual per category, including planned-but-zero-actual and actual-but-no-allocation rows", async () => {
    const period = await getOrCreateBudgetPeriod(householdId, 2026, 8);
    const dashboard = await getBudgetDashboard(householdId, period);

    expect(dashboard.categories).toHaveLength(3);
    const byId = new Map(dashboard.categories.map((row) => [row.categoryId, row]));

    // Both planned and actual, actual > planned (over).
    const groceries = byId.get(groceriesId);
    expect(groceries?.planned).toBe("300");
    expect(groceries?.actual).toBe("310"); // 250 + 60; July's 999 excluded.

    // Planned but zero actual.
    const dining = byId.get(diningId);
    expect(dining?.planned).toBe("100");
    expect(dining?.actual).toBe("0");

    // Actual but no allocation this period.
    const impulse = byId.get(impulseId);
    expect(impulse?.planned).toBe("0");
    expect(impulse?.actual).toBe("75");
  });

  it("computes the overall target aggregate as a sum across ALL household transactions this period, including uncategorized ones", async () => {
    const period = await getOrCreateBudgetPeriod(householdId, 2026, 8);
    const dashboard = await getBudgetDashboard(householdId, period);

    expect(dashboard.overall).not.toBeNull();
    expect(dashboard.overall?.target).toBe("1000");
    expect(dashboard.overall?.targetType).toBe("spend_limit");
    // 250 + 60 (groceries) + 75 (impulse) + 40 (uncategorized) = 425.
    // July's 999 excluded (out of period).
    expect(dashboard.overall?.actual).toBe("425");
  });

  it("omits the overall section entirely when the period has no overallTarget set", async () => {
    const noTargetPeriod = await getOrCreateBudgetPeriod(householdId, 2026, 9);
    const dashboard = await getBudgetDashboard(householdId, noTargetPeriod);
    expect(dashboard.overall).toBeNull();
  });
});

describe("getBudgetDashboard: zero-allocations-yet period", () => {
  const runId = Date.now().toString();
  const householdId = `test-household-dash-empty-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Empty Dashboard Household", currency: "USD" },
    });
  });

  afterAll(async () => {
    await db.budgetPeriod.deleteMany({ where: { householdId } });
    await db.household.deleteMany({ where: { id: householdId } });
  });

  it("renders zeros/empty state, not an error, for a freshly-opened period with no allocations and no transactions", async () => {
    const period = await getOrCreateBudgetPeriod(householdId, 2026, 10);
    const dashboard = await getBudgetDashboard(householdId, period);

    expect(dashboard.categories).toEqual([]);
    expect(dashboard.overall).toBeNull();
  });
});

describe("getBudgetDashboard: household scoping", () => {
  const runId = Date.now().toString();
  const householdAId = `test-household-dash-scope-a-${runId}`;
  const householdBId = `test-household-dash-scope-b-${runId}`;
  const userAId = `test-user-dash-scope-a-${runId}`;
  const userBId = `test-user-dash-scope-b-${runId}`;
  const accountAId = `test-account-dash-scope-a-${runId}`;
  const accountBId = `test-account-dash-scope-b-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdAId, name: "Dash Scope Household A", currency: "USD" },
    });
    await db.household.create({
      data: { id: householdBId, name: "Dash Scope Household B", currency: "USD" },
    });
    await db.user.create({
      data: {
        id: userAId,
        householdId: householdAId,
        email: `dash-scope-user-a-${runId}@example.com`,
        name: "Scope User A",
      },
    });
    await db.user.create({
      data: {
        id: userBId,
        householdId: householdBId,
        email: `dash-scope-user-b-${runId}@example.com`,
        name: "Scope User B",
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
    await db.transaction.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.budgetAllocation.deleteMany({
      where: { budgetPeriod: { householdId: { in: [householdAId, householdBId] } } },
    });
    await db.budgetPeriod.deleteMany({
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

  it("does not let household A's dashboard see household B's allocations, transactions, or overall target", async () => {
    const categoryA = await createCategory(householdAId, "A Category", "expense");
    const categoryB = await createCategory(householdBId, "B Category", "expense");

    const periodA = await getOrCreateBudgetPeriod(
      householdAId,
      2026,
      11,
      "500.00",
      "spend_limit",
    );
    const periodB = await getOrCreateBudgetPeriod(
      householdBId,
      2026,
      11,
      "9000.00",
      "spend_limit",
    );

    await setAllocation(householdAId, periodA.id, categoryA.id, "50.00");
    await setAllocation(householdBId, periodB.id, categoryB.id, "8000.00");

    await createTransaction(householdAId, userAId, {
      accountId: accountAId,
      categoryId: categoryA.id,
      date: new Date("2026-11-05T00:00:00.000Z"),
      amount: "10.00",
      type: "expense",
      description: "A spend",
    });
    await createTransaction(householdBId, userBId, {
      accountId: accountBId,
      categoryId: categoryB.id,
      date: new Date("2026-11-05T00:00:00.000Z"),
      amount: "7000.00",
      type: "expense",
      description: "B spend",
    });

    const dashboardA = await getBudgetDashboard(householdAId, periodA);

    expect(dashboardA.categories).toHaveLength(1);
    expect(dashboardA.categories[0].categoryId).toBe(categoryA.id);
    expect(dashboardA.categories[0].planned).toBe("50");
    expect(dashboardA.categories[0].actual).toBe("10");

    expect(dashboardA.overall?.target).toBe("500");
    expect(dashboardA.overall?.actual).toBe("10");
  });
});
