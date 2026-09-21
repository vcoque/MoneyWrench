# MoneyWrench — Budget & Savings Tracker: Design

**Date:** 2026-09-20
**Status:** Approved, pending implementation plan

## Purpose

A web app for a household to:

- Define savings objectives (goals) and track progress toward them.
- Define a monthly budget — both an overall spend/save target and per-category allocations.
- Track where money is going each month via manual entry and CSV/statement import.

Explicitly out of scope: investment management, multi-currency support, per-user private data (all household data is shared equally among household members).

## Architecture

A single Next.js (App Router, TypeScript) application deployed to Vercel:

- **Frontend**: React Server Components for data-heavy views, client components for interactive forms/dashboards, styled with Tailwind.
- **Backend**: Next.js Route Handlers / Server Actions — no separate API service.
- **Database**: Postgres (Neon), accessed via Prisma ORM.
- **Auth**: Auth.js (email/password or magic link). A `Household` groups multiple `User`s who share one set of budget data.
- **CSV import**: parsed server-side (`csv-parse` or `papaparse`) into staged rows, matched against categorization rules, then committed as transactions.

This was chosen over a split frontend/backend architecture (more ops overhead for no real benefit at this scale) and over SvelteKit (comparable shape, smaller ecosystem). One codebase, one deploy, standard auth/ORM patterns.

## Data Model

- **Household** — id, name, currency (fixed at creation)
- **User** — id, householdId, email, name, auth fields
- **Account** — id, householdId, name, type (`checking` | `credit_card` | `savings` | `cash`)
- **Category** — id, householdId, name, kind (`expense` | `savings_goal`), optional `savingsGoalId`
- **SavingsGoal** — id, householdId, name, targetAmount. Progress is *computed* (sum of all-time transactions posted to its linked category) — not stored redundantly.
- **BudgetPeriod** — id, householdId, year, month, overallTarget (optional), overallTargetType (`spend_limit` | `save_target`)
- **BudgetAllocation** — id, budgetPeriodId, categoryId, plannedAmount
- **Transaction** — id, householdId, accountId, categoryId (nullable until categorized), date, amount, type (`expense` | `income`), description, source (`manual` | `import`), importBatchId (nullable), createdByUserId
- **ImportBatch** — id, accountId, importedAt, filename, uploadedByUserId
- **CategoryRule** — id, householdId, matchType (`contains` | `exact` | `regex`), pattern, categoryId, priority

A savings goal is modeled as spending into a special category: contributing to "Vacation Fund" is a `Transaction` in the Vacation Fund category. That transaction counts against the category's monthly allocation *and* accumulates toward the goal's target — no separate contribution entity needed.

## Key Flows

**Monthly budgeting**: A household member creates/edits the month's `BudgetPeriod`: optional overall target (spend limit or save target), plus per-category `BudgetAllocation`s. Categories persist across months; allocations are re-entered per period, with an option to copy the previous month's allocations as a starting point.

**Tracking spend/save**: A dashboard shows, per category, planned vs. actual (sum of that category's transactions this period), and overall progress against `overallTarget` if set. Transactions are entered manually or arrive via import.

**Savings goals**: A goals page lists each `SavingsGoal` with progress (sum of all-time transactions in its linked category) as a bar toward `targetAmount`, independent of any single month. Contributions still show up in that month's budget view like any other category.

**CSV import**: User selects an account, uploads a CSV → server parses rows into a staged preview inside a new `ImportBatch` → rows are matched against the household's `CategoryRule`s (first match by priority wins) and pre-filled with a category → user reviews/corrects the preview, optionally saving new rules from corrections, then commits the batch, creating `Transaction` rows. Duplicate detection (same account + date + amount + description) flags likely duplicates and excludes them by default; the user can include them if legitimate.

**Household sharing**: Signup creates a household; other members join via an email-based invite link. All members have equal read/write access to all household data in v1 — no permission tiers.

## Error Handling

- CSV rows with unparseable dates/amounts are flagged in the preview, never silently dropped or guessed — user must fix or explicitly skip them before committing.
- Likely duplicate imports are flagged and excluded by default.
- Categories/goals with existing transactions can't be hard-deleted (would orphan history) — they're archived instead: hidden from new entry, still shown on historical transactions/reports.
- Being over/under budget is a visual indicator only, never a blocker on entering a transaction.
- Every query is scoped by the logged-in user's `householdId` at the data-access layer, so one household can never read or write another's data.
- Concurrent edits to budget periods/allocations use last-write-wins — acceptable at household scale, no conflict-resolution UI in v1.

## Testing

- **Unit**: budget/allocation math, savings goal progress calculation, CSV row parsing, category rule matching (priority + match types), duplicate-detection logic.
- **Integration**: server actions for creating transactions, committing an import batch, and household-scoping (cross-household access is blocked).
- **E2E (Playwright), happy paths only**: sign up → create household → add a manual transaction → set a monthly budget → import a CSV and categorize it → view a savings goal's progress.

No visual/UI regression suite given the small, personal scope of the app.
