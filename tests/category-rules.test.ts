import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCategory } from "@/lib/categories";
import {
  createCategoryRule,
  deleteCategoryRule,
  listCategoryRules,
  updateCategoryRule,
} from "@/lib/category-rules";

// Integration test against the real Postgres container (moneywrench-pg),
// following the same pattern tests/accounts.test.ts/tests/categories.test.ts
// established: create real rows across two households, then assert that
// queries/mutations scoped to household A's session never see or affect
// household B's rules.

describe("category rules household scoping", () => {
  const runId = Date.now().toString();
  const householdAId = `test-household-a-${runId}`;
  const householdBId = `test-household-b-${runId}`;

  let categoryAId: string;
  let categoryBId: string;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdAId, name: "Household A", currency: "USD" },
    });
    await db.household.create({
      data: { id: householdBId, name: "Household B", currency: "USD" },
    });

    const categoryA = await createCategory(householdAId, "Coffee", "expense");
    categoryAId = categoryA.id;
    const categoryB = await createCategory(householdBId, "Coffee", "expense");
    categoryBId = categoryB.id;
  });

  afterAll(async () => {
    await db.categoryRule.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.category.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.household.deleteMany({
      where: { id: { in: [householdAId, householdBId] } },
    });
  });

  it("does not let household A see household B's rules in its list", async () => {
    const ruleA = await createCategoryRule(householdAId, {
      matchType: "contains",
      pattern: "starbucks",
      categoryId: categoryAId,
      priority: 1,
    });
    const ruleB = await createCategoryRule(householdBId, {
      matchType: "contains",
      pattern: "peets",
      categoryId: categoryBId,
      priority: 1,
    });

    const householdARules = await listCategoryRules(householdAId);
    const householdBRules = await listCategoryRules(householdBId);

    expect(householdARules.map((r) => r.id)).toContain(ruleA.id);
    expect(householdARules.map((r) => r.id)).not.toContain(ruleB.id);
    expect(householdBRules.map((r) => r.id)).toContain(ruleB.id);
    expect(householdBRules.map((r) => r.id)).not.toContain(ruleA.id);
  });

  it("lists rules ordered by priority ascending (lower number first)", async () => {
    await db.categoryRule.deleteMany({ where: { householdId: householdAId } });

    const low = await createCategoryRule(householdAId, {
      matchType: "contains",
      pattern: "a",
      categoryId: categoryAId,
      priority: 5,
    });
    const high = await createCategoryRule(householdAId, {
      matchType: "contains",
      pattern: "b",
      categoryId: categoryAId,
      priority: 1,
    });

    const rules = await listCategoryRules(householdAId);
    expect(rules.map((r) => r.id)).toEqual([high.id, low.id]);
  });

  it("does not let household A update household B's rule", async () => {
    const ruleB = await createCategoryRule(householdBId, {
      matchType: "contains",
      pattern: "target",
      categoryId: categoryBId,
      priority: 2,
    });

    const updated = await updateCategoryRule(householdAId, ruleB.id, {
      matchType: "exact",
      pattern: "tampered",
      categoryId: categoryBId,
      priority: 99,
    });
    expect(updated).toBe(false);

    const stillThere = await db.categoryRule.findUniqueOrThrow({
      where: { id: ruleB.id },
    });
    expect(stillThere.pattern).toBe("target");
  });

  it("does not let household A delete household B's rule", async () => {
    const ruleB = await createCategoryRule(householdBId, {
      matchType: "contains",
      pattern: "walmart",
      categoryId: categoryBId,
      priority: 3,
    });

    const deleted = await deleteCategoryRule(householdAId, ruleB.id);
    expect(deleted).toBe(false);

    const stillThere = await db.categoryRule.findUnique({ where: { id: ruleB.id } });
    expect(stillThere).not.toBeNull();
  });

  it("updating and deleting within the owning household works", async () => {
    const rule = await createCategoryRule(householdAId, {
      matchType: "contains",
      pattern: "before",
      categoryId: categoryAId,
      priority: 7,
    });

    const updated = await updateCategoryRule(householdAId, rule.id, {
      matchType: "exact",
      pattern: "after",
      categoryId: categoryAId,
      priority: 8,
    });
    expect(updated).toBe(true);

    const row = await db.categoryRule.findUniqueOrThrow({ where: { id: rule.id } });
    expect(row.pattern).toBe("after");
    expect(row.matchType).toBe("exact");
    expect(row.priority).toBe(8);

    const deleted = await deleteCategoryRule(householdAId, rule.id);
    expect(deleted).toBe(true);

    const gone = await db.categoryRule.findUnique({ where: { id: rule.id } });
    expect(gone).toBeNull();
  });
});
