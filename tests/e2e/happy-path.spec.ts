import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Task 17: one Playwright test covering the design spec's full happy path
 * (sign up -> create household -> add a manual transaction -> set a
 * monthly budget -> import a CSV and categorize it -> view a savings
 * goal's progress) as a single, sequential flow against a real browser and
 * the real dev server + Postgres container (moneywrench-pg) — no mocking.
 *
 * "Clean, seeded test database" (this task's AC) is achieved the same way
 * the vitest integration suite already achieves it against this same
 * database: every piece of data this test creates is scoped under one
 * `Date.now()`-suffixed email/household, so it can never collide with
 * whatever else already lives in the dev database, and the afterAll below
 * tears its own household down again afterward — no shared global reset
 * required, and reruns are always independent of each other.
 *
 * Selectors are exclusively accessible-name based (getByLabel/getByRole),
 * matching the app's own accessible <label htmlFor>/aria-label markup —
 * never CSS classes/text-position — and every wait is an auto-retrying
 * Playwright assertion (expect(locator)...), never a fixed waitForTimeout,
 * per this task's "no flaky waits/selectors" AC.
 */

const email = `e2e-${Date.now()}@example.com`;
const password = "correct horse battery staple";
const name = "E2E Tester";
const accountName = "E2E Checking";
const categoryName = "Groceries";
const goalName = "Vacation Fund";

// A direct, unpooled PrismaClient for teardown only — deliberately NOT
// `@/lib/db` (that module is meant for the Next.js server process this
// test drives over HTTP, not for this test file's own Node process).
const db = new PrismaClient();

/**
 * The /transactions page renders TWO forms with identical field labels at
 * once: the "Add transaction" create form and the filter form (both have
 * "Account"/"Category" fields) — getByLabel("Account") alone is ambiguous
 * there. Every other field this test needs (Date/Amount/Description) IS
 * unique on the page, so only Account/Category go through the create
 * form's stable element ids (see TransactionForm.tsx) instead.
 */
async function fillTransactionForm(
  page: Page,
  fields: { date: string; amount: string; description: string; categoryLabel: string },
): Promise<void> {
  await page.getByLabel("Date").fill(fields.date);
  await page.locator("#transaction-account").selectOption({ label: accountName });
  await page.getByLabel("Amount").fill(fields.amount);
  // Type left at its default ("Expense") — the first <option>.
  await page.getByLabel("Description").fill(fields.description);
  await page.locator("#transaction-category").selectOption({ label: fields.categoryLabel });
}

test.afterAll(async () => {
  const user = await db.user.findUnique({ where: { email } });
  const householdId = user?.householdId;
  if (!householdId) {
    await db.$disconnect();
    return;
  }

  // Deletion order follows each model's foreign keys (children before the
  // parents they reference) — same ordering tests/imports.test.ts's own
  // afterAll hooks already establish, extended here with the
  // budget/goal models this flow additionally touches.
  await db.transaction.deleteMany({ where: { householdId } });
  await db.importRow.deleteMany({ where: { importBatch: { account: { householdId } } } });
  await db.importBatch.deleteMany({ where: { account: { householdId } } });
  await db.budgetAllocation.deleteMany({ where: { budgetPeriod: { householdId } } });
  await db.budgetPeriod.deleteMany({ where: { householdId } });
  await db.categoryRule.deleteMany({ where: { householdId } });
  await db.category.deleteMany({ where: { householdId } });
  await db.savingsGoal.deleteMany({ where: { householdId } });
  await db.account.deleteMany({ where: { householdId } });
  await db.user.deleteMany({ where: { householdId } });
  await db.household.deleteMany({ where: { id: householdId } });
  await db.$disconnect();
});

test("sign up, budget, import, and track a savings goal end to end", async ({ page }) => {
  await test.step("sign up creates a household and logs the user in", async () => {
    await page.goto("/signup");
    // exact: true — the "Household name" field's <label> also wraps
    // trailing helper text ("...use Your Name's Household"), whose
    // accessible name would otherwise substring-match "Your name" too.
    await page.getByLabel("Your name", { exact: true }).fill(name);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(`${new URL(page.url()).origin}/`);
  });

  await test.step("add an account", async () => {
    await page.goto("/accounts");
    await page.getByLabel("Account name").fill(accountName);
    await page.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByText(accountName)).toBeVisible();
  });

  await test.step("add an expense category", async () => {
    await page.goto("/categories");
    await page.getByLabel("Category name").fill(categoryName);
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByText(categoryName)).toBeVisible();
  });

  await test.step("add a manual transaction", async () => {
    await page.goto("/transactions");
    await fillTransactionForm(page, {
      date: "2026-04-15",
      amount: "45.00",
      description: "Weekly groceries",
      categoryLabel: categoryName,
    });
    await page.getByRole("button", { name: "Add transaction" }).click();
    await expect(page.getByText("Weekly groceries")).toBeVisible();
  });

  await test.step("set a monthly budget: overall target + a category allocation", async () => {
    await page.goto("/budget");

    await page.getByLabel("Overall target (optional)").fill("1000.00");
    await page.getByRole("radio", { name: "Spending limit" }).check();
    await page.getByRole("button", { name: "Save target" }).click();
    await expect(page.getByRole("radio", { name: "Spending limit" })).toBeChecked();

    await page.getByLabel(categoryName).fill("300.00");
    await page.getByRole("button", { name: "Save allocations" }).click();
    await expect(page.getByLabel(categoryName)).toHaveValue("300.00");
  });

  await test.step("import a CSV, categorize a row, and commit it", async () => {
    await page.goto("/import");
    await page.getByLabel("Account").selectOption({ label: accountName });

    const csv = [
      "Date,Description,Amount",
      "2026-04-20,Corner Market,-25.00",
      "2026-04-21,Paycheck,500.00",
    ].join("\n");
    await page.getByLabel("CSV file").setInputFiles({
      name: "e2e-import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Date column").selectOption({ label: "Date" });
    await page.getByLabel("Description column").selectOption({ label: "Description" });
    await page.getByLabel("Amount column").selectOption({ label: "Amount" });
    await page.getByRole("button", { name: "Parse and preview" }).click();

    // Categorize the "Corner Market" row (staged uncategorized — no
    // CategoryRule exists in this household) before committing.
    const cornerMarketRow = page.locator("tr", { hasText: "Corner Market" });
    await cornerMarketRow
      .getByRole("combobox", { name: "Category for row 1" })
      .selectOption({ label: categoryName });
    await cornerMarketRow.getByRole("button", { name: "Save" }).click();

    await page.getByRole("button", { name: /^Commit \d+ transactions?$/ }).click();
    await expect(page.getByText("Committed —")).toBeVisible();

    // The commit actually landed a real Transaction, categorized correctly.
    await page.goto("/transactions");
    const importedRow = page.locator("li", { hasText: "Corner Market" });
    await expect(importedRow).toContainText(categoryName);
  });

  await test.step("create a savings goal and watch its progress update", async () => {
    await page.goto("/goals");
    await page.getByLabel("Goal name").fill(goalName);
    await page.getByLabel("Target amount").fill("500.00");
    await page.getByRole("button", { name: "Add goal" }).click();

    const goalCard = page.locator("li", { hasText: goalName });
    await expect(goalCard).toContainText("$0.00 / $500.00");

    // Contributing to a goal is just an ordinary transaction posted to its
    // (auto-created) linked category — no separate "contribute" flow.
    await page.goto("/transactions");
    await fillTransactionForm(page, {
      date: "2026-04-25",
      amount: "100.00",
      description: "Deposit to vacation fund",
      categoryLabel: goalName,
    });
    await page.getByRole("button", { name: "Add transaction" }).click();
    await expect(page.getByText("Deposit to vacation fund")).toBeVisible();

    await page.goto("/goals");
    await expect(page.locator("li", { hasText: goalName })).toContainText(
      "$100.00 / $500.00",
    );
  });
});
