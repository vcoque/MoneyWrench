import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCategory } from "@/lib/categories";
import {
  copyAllocationsFromPreviousPeriod,
  getAllocationsForPeriod,
  getOrCreateBudgetPeriod,
  setAllocation,
} from "@/lib/budgets";

// Integration tests against the real Postgres container (moneywrench-pg),
// following the same pattern as tests/goals.test.ts and
// tests/categories.test.ts: create real rows, assert against actual
// queries, clean up in afterAll. Uses unique per-run ids so repeated local
// runs don't collide with leftover rows.

describe("getOrCreateBudgetPeriod: upsert, not duplicate", () => {
  const runId = Date.now().toString();
  const householdId = `test-household-period-upsert-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Period Upsert Household", currency: "USD" },
    });
  });

  afterAll(async () => {
    await db.budgetAllocation.deleteMany({
      where: { budgetPeriod: { householdId } },
    });
    await db.budgetPeriod.deleteMany({ where: { householdId } });
    await db.household.deleteMany({ where: { id: householdId } });
  });

  it("creating a period twice for the same household/year/month updates the existing row instead of creating a duplicate", async () => {
    const first = await getOrCreateBudgetPeriod(
      householdId,
      2026,
      3,
      "1000.00",
      "spend_limit",
    );
    const second = await getOrCreateBudgetPeriod(
      householdId,
      2026,
      3,
      "1500.00",
      "save_target",
    );

    // Same row, not a new one.
    expect(second.id).toBe(first.id);

    const rows = await db.budgetPeriod.findMany({
      where: { householdId, year: 2026, month: 3 },
    });
    expect(rows).toHaveLength(1);

    // The second call's values actually took effect (genuine update, not a
    // no-op that just returned the first row unchanged).
    expect(rows[0].overallTarget?.toString()).toBe("1500");
    expect(rows[0].overallTargetType).toBe("save_target");
  });

  it("opening a period with no target args (plain navigation) does not clobber a previously-set target", async () => {
    await getOrCreateBudgetPeriod(
      householdId,
      2026,
      4,
      "800.00",
      "spend_limit",
    );

    // Simulates just visiting the page for a month that already has a
    // target set — no target args passed at all.
    const reopened = await getOrCreateBudgetPeriod(householdId, 2026, 4);

    expect(reopened.overallTarget?.toString()).toBe("800");
    expect(reopened.overallTargetType).toBe("spend_limit");
  });

  it("passing explicit null target args clears a previously-set target", async () => {
    await getOrCreateBudgetPeriod(
      householdId,
      2026,
      5,
      "200.00",
      "save_target",
    );

    const cleared = await getOrCreateBudgetPeriod(
      householdId,
      2026,
      5,
      null,
      null,
    );

    expect(cleared.overallTarget).toBeNull();
    expect(cleared.overallTargetType).toBeNull();
  });
});

describe("setAllocation: upsert, not duplicate", () => {
  const runId = Date.now().toString();
  const householdId = `test-household-alloc-upsert-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Allocation Upsert Household", currency: "USD" },
    });
  });

  afterAll(async () => {
    await db.budgetAllocation.deleteMany({
      where: { budgetPeriod: { householdId } },
    });
    await db.budgetPeriod.deleteMany({ where: { householdId } });
    await db.category.deleteMany({ where: { householdId } });
    await db.household.deleteMany({ where: { id: householdId } });
  });

  it("setting an allocation for a category twice in the same period updates the existing row instead of creating a duplicate", async () => {
    const period = await getOrCreateBudgetPeriod(householdId, 2026, 6);
    const category = await createCategory(householdId, "Groceries", "expense");

    const first = await setAllocation(
      householdId,
      period.id,
      category.id,
      "300.00",
    );
    const second = await setAllocation(
      householdId,
      period.id,
      category.id,
      "450.50",
    );

    expect(second.id).toBe(first.id);

    const rows = await db.budgetAllocation.findMany({
      where: { budgetPeriodId: period.id, categoryId: category.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].plannedAmount.toString()).toBe("450.5");
  });

  it("rejects setting an allocation against a budget period or category from another household, even with a genuine id", async () => {
    const otherHouseholdId = `test-household-alloc-upsert-other-${runId}`;
    await db.household.create({
      data: { id: otherHouseholdId, name: "Other Household", currency: "USD" },
    });

    try {
      const ownPeriod = await getOrCreateBudgetPeriod(householdId, 2026, 7);
      const otherCategory = await createCategory(
        otherHouseholdId,
        "Other's Category",
        "expense",
      );
      const otherPeriod = await getOrCreateBudgetPeriod(
        otherHouseholdId,
        2026,
        7,
      );
      const ownCategory = await createCategory(
        householdId,
        "Own Category",
        "expense",
      );

      // Own period, but another household's category id.
      await expect(
        setAllocation(householdId, ownPeriod.id, otherCategory.id, "10.00"),
      ).rejects.toThrow();

      // Own category, but another household's period id.
      await expect(
        setAllocation(householdId, otherPeriod.id, ownCategory.id, "10.00"),
      ).rejects.toThrow();

      // No stray rows were written by either rejected call.
      const rows = await db.budgetAllocation.findMany({
        where: {
          OR: [
            { budgetPeriodId: ownPeriod.id },
            { budgetPeriodId: otherPeriod.id },
          ],
        },
      });
      expect(rows).toHaveLength(0);
    } finally {
      await db.budgetAllocation.deleteMany({
        where: { budgetPeriod: { householdId: otherHouseholdId } },
      });
      await db.budgetPeriod.deleteMany({ where: { householdId: otherHouseholdId } });
      await db.category.deleteMany({ where: { householdId: otherHouseholdId } });
      await db.household.deleteMany({ where: { id: otherHouseholdId } });
    }
  });
});

describe("setAllocation: batch atomicity via db.$transaction", () => {
  // Regression test for the review finding on app/(app)/budget/actions.ts's
  // saveAllocationsAction: it used to write each category's allocation as
  // it validated them, one at a time, so a failure partway through a batch
  // (e.g. an invalid amount, or — as reproduced directly here — an
  // ownership-check failure) left earlier categories in that SAME
  // submission already persisted. The fix wraps the whole per-category
  // write loop in one db.$transaction, passing setAllocation's optional
  // `client` (tx) argument, so a failure anywhere in the batch rolls back
  // everything written earlier in that same transaction too. This proves
  // the underlying building block the fix relies on: setAllocation
  // genuinely participates in, and is rolled back by, the caller's
  // transaction — not just "doesn't error twice."
  const runId = Date.now().toString();
  const householdId = `test-household-alloc-atomic-${runId}`;
  const otherHouseholdId = `test-household-alloc-atomic-other-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Atomic Batch Household", currency: "USD" },
    });
    await db.household.create({
      data: { id: otherHouseholdId, name: "Atomic Batch Other Household", currency: "USD" },
    });
  });

  afterAll(async () => {
    await db.budgetAllocation.deleteMany({
      where: { budgetPeriod: { householdId: { in: [householdId, otherHouseholdId] } } },
    });
    await db.budgetPeriod.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await db.category.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await db.household.deleteMany({
      where: { id: { in: [householdId, otherHouseholdId] } },
    });
  });

  it("rolls back every write in the batch when a later entry fails, leaving none of the batch persisted", async () => {
    const period = await getOrCreateBudgetPeriod(householdId, 2031, 1);
    const groceries = await createCategory(householdId, "Groceries C", "expense");
    const dining = await createCategory(householdId, "Dining C", "expense");
    // A category id that genuinely belongs to a DIFFERENT household — same
    // shape of failure setAllocation's ownership check raises for a
    // tampered/stale id, placed last in the batch so the first two entries
    // would (bug-era) already be committed by the time this one throws.
    const foreignCategory = await createCategory(
      otherHouseholdId,
      "Foreign Category",
      "expense",
    );

    const batch: { categoryId: string; amount: string }[] = [
      { categoryId: groceries.id, amount: "400.00" },
      { categoryId: dining.id, amount: "150.75" },
      { categoryId: foreignCategory.id, amount: "50.00" },
    ];

    await expect(
      db.$transaction(async (tx) => {
        for (const entry of batch) {
          await setAllocation(householdId, period.id, entry.categoryId, entry.amount, tx);
        }
      }),
    ).rejects.toThrow();

    // Neither of the two earlier, individually-valid entries was left
    // behind — the whole batch's writes were rolled back together.
    const rows = await getAllocationsForPeriod(period.id);
    expect(rows).toHaveLength(0);
  });

  it("commits every write in the batch when all entries succeed", async () => {
    const period = await getOrCreateBudgetPeriod(householdId, 2031, 2);
    const rent = await createCategory(householdId, "Rent C", "expense");
    const utilities = await createCategory(householdId, "Utilities C", "expense");

    const batch: { categoryId: string; amount: string }[] = [
      { categoryId: rent.id, amount: "1200.00" },
      { categoryId: utilities.id, amount: "85.25" },
    ];

    await db.$transaction(async (tx) => {
      for (const entry of batch) {
        await setAllocation(householdId, period.id, entry.categoryId, entry.amount, tx);
      }
    });

    const rows = await getAllocationsForPeriod(period.id);
    expect(rows).toHaveLength(2);
    const byCategory = new Map(rows.map((r) => [r.categoryId, r.plannedAmount.toString()]));
    expect(byCategory.get(rent.id)).toBe("1200");
    expect(byCategory.get(utilities.id)).toBe("85.25");
  });
});

describe("copyAllocationsFromPreviousPeriod", () => {
  const runId = Date.now().toString();
  const householdId = `test-household-copy-${runId}`;
  const otherHouseholdId = `test-household-copy-other-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Copy Household", currency: "USD" },
    });
    await db.household.create({
      data: { id: otherHouseholdId, name: "Copy Other Household", currency: "USD" },
    });
  });

  afterAll(async () => {
    await db.budgetAllocation.deleteMany({
      where: { budgetPeriod: { householdId: { in: [householdId, otherHouseholdId] } } },
    });
    await db.budgetPeriod.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await db.category.deleteMany({
      where: { householdId: { in: [householdId, otherHouseholdId] } },
    });
    await db.household.deleteMany({
      where: { id: { in: [householdId, otherHouseholdId] } },
    });
  });

  it("copies allocations from month N into month N+1, matching exactly", async () => {
    const groceries = await createCategory(householdId, "Groceries A", "expense");
    const dining = await createCategory(householdId, "Dining A", "expense");

    const november = await getOrCreateBudgetPeriod(householdId, 2025, 11);
    await setAllocation(householdId, november.id, groceries.id, "500.00");
    await setAllocation(householdId, november.id, dining.id, "150.25");

    const december = await getOrCreateBudgetPeriod(householdId, 2025, 12);
    const copied = await copyAllocationsFromPreviousPeriod(
      householdId,
      december.id,
    );
    expect(copied).toHaveLength(2);

    const decemberAllocations = await getAllocationsForPeriod(december.id);
    const byCategory = new Map(
      decemberAllocations.map((a) => [a.categoryId, a.plannedAmount.toString()]),
    );

    expect(byCategory.get(groceries.id)).toBe("500");
    expect(byCategory.get(dining.id)).toBe("150.25");
  });

  it("skips a month with no period row and finds the most recent PRIOR period that actually exists", async () => {
    // Isolated household (rather than the shared `householdId` other tests
    // in this block use) so no other test's periods can accidentally be
    // chronologically closer to the target than the gap this test sets up.
    const skipHouseholdId = `test-household-copy-skip-${runId}`;
    await db.household.create({
      data: { id: skipHouseholdId, name: "Copy Skip Household", currency: "USD" },
    });

    try {
      // November has real allocations. December has NO BudgetPeriod row at
      // all (never visited/created) — proving this isn't naively "copy the
      // literal previous calendar month" but a genuine "most recent prior
      // period that exists" search.
      const utilities = await createCategory(
        skipHouseholdId,
        "Utilities A",
        "expense",
      );

      const november = await getOrCreateBudgetPeriod(skipHouseholdId, 2025, 11);
      await setAllocation(skipHouseholdId, november.id, utilities.id, "220.00");
      // December: deliberately never created — no BudgetPeriod row exists.

      const target = await getOrCreateBudgetPeriod(skipHouseholdId, 2026, 1);
      const copied = await copyAllocationsFromPreviousPeriod(
        skipHouseholdId,
        target.id,
      );

      expect(copied).toHaveLength(1);
      const targetAllocations = await getAllocationsForPeriod(target.id);
      expect(targetAllocations).toHaveLength(1);
      expect(targetAllocations[0].categoryId).toBe(utilities.id);
      expect(targetAllocations[0].plannedAmount.toString()).toBe("220");
    } finally {
      await db.budgetAllocation.deleteMany({
        where: { budgetPeriod: { householdId: skipHouseholdId } },
      });
      await db.budgetPeriod.deleteMany({ where: { householdId: skipHouseholdId } });
      await db.category.deleteMany({ where: { householdId: skipHouseholdId } });
      await db.household.deleteMany({ where: { id: skipHouseholdId } });
    }
  });

  it("running copy twice is idempotent — no duplicate allocation rows", async () => {
    const rent = await createCategory(householdId, "Rent A", "expense");
    const source = await getOrCreateBudgetPeriod(householdId, 2028, 1);
    await setAllocation(householdId, source.id, rent.id, "1200.00");

    const target = await getOrCreateBudgetPeriod(householdId, 2028, 2);
    await copyAllocationsFromPreviousPeriod(householdId, target.id);
    await copyAllocationsFromPreviousPeriod(householdId, target.id);

    const rows = await db.budgetAllocation.findMany({
      where: { budgetPeriodId: target.id, categoryId: rent.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].plannedAmount.toString()).toBe("1200");
  });

  it("never uses another household's period as the 'previous period', even one that is chronologically closer", async () => {
    // Other household has a period in the month right before the target,
    // with allocations — if household scoping were broken, those would
    // leak in as the "most recent prior period" instead of household's own
    // (older) real data.
    const ownCategory = await createCategory(householdId, "Own Category B", "expense");
    const ownPast = await getOrCreateBudgetPeriod(householdId, 2029, 1);
    await setAllocation(householdId, ownPast.id, ownCategory.id, "77.00");

    const otherCategory = await createCategory(
      otherHouseholdId,
      "Other Category B",
      "expense",
    );
    const otherRecentPast = await getOrCreateBudgetPeriod(
      otherHouseholdId,
      2029,
      2,
    );
    await setAllocation(
      otherHouseholdId,
      otherRecentPast.id,
      otherCategory.id,
      "999.00",
    );

    const target = await getOrCreateBudgetPeriod(householdId, 2029, 3);
    const copied = await copyAllocationsFromPreviousPeriod(householdId, target.id);

    expect(copied).toHaveLength(1);
    expect(copied[0].categoryId).toBe(ownCategory.id);
    expect(copied[0].plannedAmount.toString()).toBe("77");
  });
});

describe("household scoping", () => {
  const runId = Date.now().toString();
  // Prefixed distinctly from tests/goals.test.ts's own "household scoping"
  // describe (which uses "test-household-scope-a/b") — both files' runIds
  // are Date.now()-based, so an identical prefix risks a real primary-key
  // collision if both test files happen to start in the same millisecond
  // under parallel execution.
  const householdAId = `test-household-budget-scope-a-${runId}`;
  const householdBId = `test-household-budget-scope-b-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdAId, name: "Scope Household A", currency: "USD" },
    });
    await db.household.create({
      data: { id: householdBId, name: "Scope Household B", currency: "USD" },
    });
  });

  afterAll(async () => {
    await db.budgetAllocation.deleteMany({
      where: { budgetPeriod: { householdId: { in: [householdAId, householdBId] } } },
    });
    await db.budgetPeriod.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.category.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.household.deleteMany({
      where: { id: { in: [householdAId, householdBId] } },
    });
  });

  it("does not let household A's period upsert collide with household B's period for the same year/month", async () => {
    const periodA = await getOrCreateBudgetPeriod(
      householdAId,
      2030,
      1,
      "100.00",
      "spend_limit",
    );
    const periodB = await getOrCreateBudgetPeriod(
      householdBId,
      2030,
      1,
      "200.00",
      "save_target",
    );

    expect(periodA.id).not.toBe(periodB.id);
    expect(periodA.overallTarget?.toString()).toBe("100");
    expect(periodB.overallTarget?.toString()).toBe("200");
  });

  it("does not let household A see household B's allocations for its own period", async () => {
    const categoryA = await createCategory(householdAId, "A Category", "expense");
    const categoryB = await createCategory(householdBId, "B Category", "expense");

    const periodA = await getOrCreateBudgetPeriod(householdAId, 2030, 2);
    const periodB = await getOrCreateBudgetPeriod(householdBId, 2030, 2);

    await setAllocation(householdAId, periodA.id, categoryA.id, "10.00");
    await setAllocation(householdBId, periodB.id, categoryB.id, "20.00");

    const allocationsA = await getAllocationsForPeriod(periodA.id);
    const allocationsB = await getAllocationsForPeriod(periodB.id);

    expect(allocationsA.map((a) => a.categoryId)).toEqual([categoryA.id]);
    expect(allocationsB.map((a) => a.categoryId)).toEqual([categoryB.id]);
  });
});
