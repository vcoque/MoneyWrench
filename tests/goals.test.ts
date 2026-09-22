import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createGoal, listGoalsWithProgress } from "@/lib/goals";

// Integration tests against the real Postgres container (moneywrench-pg),
// following the pattern tests/accounts.test.ts, tests/categories.test.ts,
// and tests/transactions.test.ts established: create real rows, then
// assert against actual queries — not mocks. Covers three things this
// task's brief calls out specifically:
//   1. the progress-calculation math itself (sum of transactions / target)
//   2. household scoping (a household never sees another's goals/progress)
//   3. no stale caching — a newly logged transaction changes what the very
//      next progress read returns, proven with a real before/after query.
//
// Uses unique per-run ids (Date.now()-suffixed) so repeated local runs
// don't collide with leftover rows, and cleans up everything it creates in
// `afterAll`.

describe("createGoal", () => {
  const runId = Date.now().toString();
  const householdId = `test-household-create-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Create Household", currency: "USD" },
    });
  });

  afterAll(async () => {
    await db.category.deleteMany({ where: { householdId } });
    await db.savingsGoal.deleteMany({ where: { householdId } });
    await db.household.deleteMany({ where: { id: householdId } });
  });

  it("creates both the SavingsGoal row and its linked savings_goal-kind Category atomically", async () => {
    const goal = await createGoal(householdId, "Vacation Fund", "2000.00");

    expect(goal.name).toBe("Vacation Fund");
    expect(goal.targetAmount.toString()).toBe("2000");

    const category = await db.category.findUnique({
      where: { savingsGoalId: goal.id },
    });

    expect(category).not.toBeNull();
    expect(category?.kind).toBe("savings_goal");
    expect(category?.name).toBe("Vacation Fund");
    expect(category?.householdId).toBe(householdId);
    expect(category?.savingsGoalId).toBe(goal.id);
  });
});

describe("listGoalsWithProgress: progress calculation", () => {
  const runId = Date.now().toString();
  const householdId = `test-household-progress-${runId}`;
  const userId = `test-user-progress-${runId}`;
  const accountId = `test-account-progress-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "Progress Household", currency: "USD" },
    });
    await db.user.create({
      data: {
        id: userId,
        householdId,
        email: `goals-progress-${runId}@example.com`,
        name: "Progress Tester",
      },
    });
    await db.account.create({
      data: { id: accountId, householdId, name: "Checking", type: "checking" },
    });
  });

  afterAll(async () => {
    await db.transaction.deleteMany({ where: { householdId } });
    await db.category.deleteMany({ where: { householdId } });
    await db.savingsGoal.deleteMany({ where: { householdId } });
    await db.account.deleteMany({ where: { householdId } });
    await db.user.deleteMany({ where: { householdId } });
    await db.household.deleteMany({ where: { id: householdId } });
  });

  it("computes progress as the exact all-time sum of transactions posted to the goal's category, with $0 progress for a goal with no transactions", async () => {
    const fundedGoal = await createGoal(householdId, "Emergency Fund", "1000.00");
    const emptyGoal = await createGoal(householdId, "New Car", "5000.00");

    const fundedCategory = await db.category.findUniqueOrThrow({
      where: { savingsGoalId: fundedGoal.id },
    });

    // Three separate contributions, deliberately not round numbers, so the
    // test genuinely proves summation rather than a single value passing
    // through unchanged.
    for (const amount of ["100.00", "250.50", "49.50"]) {
      await db.transaction.create({
        data: {
          householdId,
          accountId,
          categoryId: fundedCategory.id,
          date: new Date(),
          amount,
          type: "expense",
          description: "Contribution",
          source: "manual",
          createdByUserId: userId,
        },
      });
    }

    const goals = await listGoalsWithProgress(householdId);

    const fundedResult = goals.find((g) => g.id === fundedGoal.id);
    const emptyResult = goals.find((g) => g.id === emptyGoal.id);

    expect(fundedResult).toBeDefined();
    expect(Number(fundedResult?.progress)).toBe(400); // 100.00 + 250.50 + 49.50
    expect(fundedResult?.categoryId).toBe(fundedCategory.id);

    expect(emptyResult).toBeDefined();
    expect(Number(emptyResult?.progress)).toBe(0);
  });

  it("does not offset or exclude transactions by type — progress is a plain sum, not income-minus-expense", async () => {
    // Per the controller ruling: contributing to a goal is modeled as an
    // ordinary transaction in its category, with no type-based
    // sign-flipping. A transaction typed "income" in the goal's category
    // must still add to progress exactly like "expense" does.
    const goal = await createGoal(householdId, "Type Neutrality Check", "100.00");
    const category = await db.category.findUniqueOrThrow({
      where: { savingsGoalId: goal.id },
    });

    await db.transaction.create({
      data: {
        householdId,
        accountId,
        categoryId: category.id,
        date: new Date(),
        amount: "30.00",
        type: "income",
        description: "Contribution posted as income",
        source: "manual",
        createdByUserId: userId,
      },
    });
    await db.transaction.create({
      data: {
        householdId,
        accountId,
        categoryId: category.id,
        date: new Date(),
        amount: "20.00",
        type: "expense",
        description: "Contribution posted as expense",
        source: "manual",
        createdByUserId: userId,
      },
    });

    const goals = await listGoalsWithProgress(householdId);
    const result = goals.find((g) => g.id === goal.id);

    expect(Number(result?.progress)).toBe(50); // 30.00 + 20.00, no offsetting
  });
});

describe("listGoalsWithProgress: no stale caching", () => {
  const runId = Date.now().toString();
  const householdId = `test-household-nocache-${runId}`;
  const userId = `test-user-nocache-${runId}`;
  const accountId = `test-account-nocache-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdId, name: "No-Cache Household", currency: "USD" },
    });
    await db.user.create({
      data: {
        id: userId,
        householdId,
        email: `goals-nocache-${runId}@example.com`,
        name: "No-Cache Tester",
      },
    });
    await db.account.create({
      data: { id: accountId, householdId, name: "Checking", type: "checking" },
    });
  });

  afterAll(async () => {
    await db.transaction.deleteMany({ where: { householdId } });
    await db.category.deleteMany({ where: { householdId } });
    await db.savingsGoal.deleteMany({ where: { householdId } });
    await db.account.deleteMany({ where: { householdId } });
    await db.user.deleteMany({ where: { householdId } });
    await db.household.deleteMany({ where: { id: householdId } });
  });

  it("reflects a newly logged transaction on the very next read, with no caching in between", async () => {
    const goal = await createGoal(householdId, "Read-Time Check", "500.00");
    const category = await db.category.findUniqueOrThrow({
      where: { savingsGoalId: goal.id },
    });

    const before = await listGoalsWithProgress(householdId);
    const beforeResult = before.find((g) => g.id === goal.id);
    expect(Number(beforeResult?.progress)).toBe(0);

    await db.transaction.create({
      data: {
        householdId,
        accountId,
        categoryId: category.id,
        date: new Date(),
        amount: "75.25",
        type: "expense",
        description: "New contribution",
        source: "manual",
        createdByUserId: userId,
      },
    });

    const after = await listGoalsWithProgress(householdId);
    const afterResult = after.find((g) => g.id === goal.id);
    expect(Number(afterResult?.progress)).toBe(75.25);
  });
});

describe("listGoalsWithProgress: household scoping", () => {
  const runId = Date.now().toString();
  const householdAId = `test-household-scope-a-${runId}`;
  const householdBId = `test-household-scope-b-${runId}`;
  const userAId = `test-user-scope-a-${runId}`;
  const userBId = `test-user-scope-b-${runId}`;
  const accountAId = `test-account-scope-a-${runId}`;
  const accountBId = `test-account-scope-b-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdAId, name: "Scope Household A", currency: "USD" },
    });
    await db.household.create({
      data: { id: householdBId, name: "Scope Household B", currency: "USD" },
    });
    await db.user.create({
      data: {
        id: userAId,
        householdId: householdAId,
        email: `goals-scope-a-${runId}@example.com`,
        name: "Scope Tester A",
      },
    });
    await db.user.create({
      data: {
        id: userBId,
        householdId: householdBId,
        email: `goals-scope-b-${runId}@example.com`,
        name: "Scope Tester B",
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
        id: accountBId,
        householdId: householdBId,
        name: "B Checking",
        type: "checking",
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
    await db.savingsGoal.deleteMany({
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

  it("does not let household A see household B's goals, or B's transactions leak into A's progress", async () => {
    const goalA = await createGoal(householdAId, "A's Goal", "100.00");
    const goalB = await createGoal(householdBId, "B's Goal", "100.00");

    const categoryA = await db.category.findUniqueOrThrow({
      where: { savingsGoalId: goalA.id },
    });
    const categoryB = await db.category.findUniqueOrThrow({
      where: { savingsGoalId: goalB.id },
    });

    await db.transaction.create({
      data: {
        householdId: householdAId,
        accountId: accountAId,
        categoryId: categoryA.id,
        date: new Date(),
        amount: "10.00",
        type: "expense",
        description: "A contribution",
        source: "manual",
        createdByUserId: userAId,
      },
    });
    await db.transaction.create({
      data: {
        householdId: householdBId,
        accountId: accountBId,
        categoryId: categoryB.id,
        date: new Date(),
        amount: "999.00",
        type: "expense",
        description: "B contribution",
        source: "manual",
        createdByUserId: userBId,
      },
    });

    const goalsA = await listGoalsWithProgress(householdAId);
    const goalsB = await listGoalsWithProgress(householdBId);

    expect(goalsA.map((g) => g.id)).toContain(goalA.id);
    expect(goalsA.map((g) => g.id)).not.toContain(goalB.id);

    expect(goalsB.map((g) => g.id)).toContain(goalB.id);
    expect(goalsB.map((g) => g.id)).not.toContain(goalA.id);

    const resultA = goalsA.find((g) => g.id === goalA.id);
    expect(Number(resultA?.progress)).toBe(10); // not 999 — B's transaction never leaks into A's sum
  });
});
