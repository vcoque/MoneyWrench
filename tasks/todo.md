# MoneyWrench — Task List

See `tasks/plan.md` for architecture decisions, phases, and checkpoints.

---

## Task 1: Scaffold Next.js project

**Description:** Initialize the Next.js (App Router, TypeScript) project with Tailwind, ESLint, Prettier, and a test runner (Vitest for unit/integration, Playwright for E2E). Establish the base folder structure (`app/`, `lib/`, `prisma/`, `tests/`).

**Acceptance criteria:**
- [ ] `npm run dev` serves a default page
- [ ] `npm run lint`, `npm run build`, and `npm test` all succeed on a trivial smoke test
- [ ] Repo has `.gitignore` covering `node_modules`, `.env`, `.next`

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: `npm run dev` and load the page in a browser

**Dependencies:** None

**Files likely touched:**
- `package.json`, `tsconfig.json`, `next.config.ts`
- `app/layout.tsx`, `app/page.tsx`
- `.eslintrc`, `.gitignore`

**Estimated scope:** Medium: 3-5 files

---

## Task 2: Household/User schema + Postgres connection

**Description:** Set up Prisma with a Postgres (Neon) connection, and define the initial `Household` and `User` models plus the first migration.

**Acceptance criteria:**
- [ ] `prisma/schema.prisma` defines `Household` (id, name, currency) and `User` (id, householdId, email, name)
- [ ] `npx prisma migrate dev` runs cleanly against a local/dev Postgres instance
- [ ] A seed script creates one household and one user for local dev

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: `npx prisma studio` shows the seeded household/user

**Dependencies:** Task 1

**Files likely touched:**
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `lib/db.ts`

**Estimated scope:** Small: 1-2 files

---

## Task 3: Auth.js signup/login with household scoping

**Description:** Integrate Auth.js for email/password (or magic link) authentication. Signing up with no existing household creates one; the session must carry `householdId` so every later query can scope by it.

**Acceptance criteria:**
- [ ] A new user can sign up, which creates a `Household` and a `User` linked to it
- [ ] A user can log out and log back in
- [ ] The session object exposes `householdId` and `userId`
- [ ] Unauthenticated requests to protected routes redirect to login

**Verification:**
- [ ] Tests pass: `npm test` (auth callback unit tests)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: sign up, log out, log back in via the browser

**Dependencies:** Task 2

**Files likely touched:**
- `lib/auth.ts` (Auth.js config)
- `app/(auth)/signup/page.tsx`, `app/(auth)/login/page.tsx`
- `middleware.ts`

**Estimated scope:** Medium: 3-5 files

---

## Task 4: Household invite flow

**Description:** Allow an existing household member to generate an email-based invite link; a new user following that link joins the inviting household instead of creating a new one.

**Acceptance criteria:**
- [ ] A logged-in user can generate an invite link for their household
- [ ] Following the link and signing up joins the existing household (no new household created)
- [ ] Expired or already-used invite links show a clear error, not a crash

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: generate an invite, open it in an incognito window, sign up, confirm both users share one household's data

**Dependencies:** Task 3

**Files likely touched:**
- `prisma/schema.prisma` (add `Invite` model)
- `app/(auth)/invite/[token]/page.tsx`
- `lib/invites.ts`

**Estimated scope:** Medium: 3-5 files

---

## Task 5: Domain schema (Account, Category, SavingsGoal, BudgetPeriod, BudgetAllocation, Transaction, ImportBatch, CategoryRule)

**Description:** Add the remaining Prisma models from the design spec's data model and generate the migration. No UI yet — this is schema-only plus a migration.

**Acceptance criteria:**
- [ ] All eight models exist in `prisma/schema.prisma` matching the design spec's fields and relations
- [ ] `npx prisma migrate dev` succeeds
- [ ] Seed script extends to create one account and one category for local dev

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: `npx prisma studio` shows all new tables with correct relations

**Dependencies:** Task 2

**Files likely touched:**
- `prisma/schema.prisma`
- `prisma/seed.ts`

**Estimated scope:** Small: 1-2 files

---

## Task 6: Accounts CRUD

**Description:** Server actions and UI to create, list, and archive `Account` records, scoped to the logged-in user's household.

**Acceptance criteria:**
- [ ] User can create an account with a name and type (checking/credit_card/savings/cash)
- [ ] Account list page shows all non-archived accounts for the household
- [ ] Archiving an account hides it from selection lists but keeps historical transactions intact
- [ ] A user from a different household cannot see or modify another household's accounts

**Verification:**
- [ ] Tests pass: `npm test` (household-scoping integration test)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: create/archive an account in the browser

**Dependencies:** Task 5

**Files likely touched:**
- `app/(app)/accounts/page.tsx`
- `app/(app)/accounts/actions.ts`

**Estimated scope:** Small: 1-2 files

---

## Task 7: Categories CRUD

**Description:** Server actions and UI to create, list, and archive `Category` records (kind: expense or savings_goal), scoped to household.

**Acceptance criteria:**
- [ ] User can create an expense category with a name
- [ ] Category list distinguishes expense categories from savings-goal-linked categories
- [ ] Archiving a category with existing transactions is blocked from hard delete, archived instead
- [ ] Household scoping enforced (same as Task 6)

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: create/archive a category, confirm archived categories still show on old transactions

**Dependencies:** Task 5

**Files likely touched:**
- `app/(app)/categories/page.tsx`
- `app/(app)/categories/actions.ts`

**Estimated scope:** Small: 1-2 files

---

## Task 8: Manual transaction entry + list

**Description:** Form to create a transaction (date, account, amount, type, description, category) and a list view filterable by account, category, and month.

**Acceptance criteria:**
- [ ] User can log a manual transaction with all required fields
- [ ] Transaction list is filterable by account, category, and month
- [ ] User can edit or delete a manually-entered transaction
- [ ] Household scoping enforced

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: create, edit, delete a transaction; filter the list

**Dependencies:** Task 6, Task 7

**Files likely touched:**
- `app/(app)/transactions/page.tsx`
- `app/(app)/transactions/actions.ts`
- `app/(app)/transactions/TransactionForm.tsx`

**Estimated scope:** Medium: 3-5 files

---

## Task 9: Savings goals (create + computed progress)

**Description:** UI to create a `SavingsGoal` (auto-creating its linked `savings_goal`-kind category) and a goals page showing each goal's progress bar, computed as the sum of all-time transactions in its linked category.

**Acceptance criteria:**
- [ ] Creating a goal creates both the `SavingsGoal` row and its linked `Category`
- [ ] Goals page shows progress = sum(transactions in linked category) / targetAmount
- [ ] Logging a transaction to a goal's category updates its progress on next view (no caching bugs)
- [ ] Household scoping enforced

**Verification:**
- [ ] Tests pass: `npm test` (unit test for progress calculation)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: create a goal, log a transaction to it, confirm progress bar updates

**Dependencies:** Task 8

**Files likely touched:**
- `app/(app)/goals/page.tsx`
- `app/(app)/goals/actions.ts`
- `lib/goals.ts` (progress calculation)

**Estimated scope:** Medium: 3-5 files

---

## Task 10: Monthly budget periods + allocations

**Description:** UI to create/edit a `BudgetPeriod` for a given month (optional overall target + type), and per-category `BudgetAllocation`s within it. Include a "copy last month's allocations" action.

**Acceptance criteria:**
- [ ] User can create a budget period for a month with an optional overall target (spend_limit or save_target)
- [ ] User can allocate a planned amount to each category within that period
- [ ] "Copy last month" pre-fills allocations from the most recent prior period
- [ ] Household scoping enforced

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: create a budget period, allocate amounts, copy to a new month

**Dependencies:** Task 7

**Files likely touched:**
- `app/(app)/budget/page.tsx`
- `app/(app)/budget/actions.ts`

**Estimated scope:** Medium: 3-5 files

---

## Task 11: Budget dashboard (planned vs. actual, over/under indicators)

**Description:** Dashboard view showing, per category, planned vs. actual spend/save for the current period, plus overall progress against the period's overall target. Visual indicator (not a block) when over budget.

**Acceptance criteria:**
- [ ] Each category row shows planned amount, actual (sum of its transactions this period), and a visual over/under indicator
- [ ] Overall target (if set) shows aggregate progress the same way
- [ ] Dashboard correctly handles a period with no allocations yet (shows zeros, not an error)

**Verification:**
- [ ] Tests pass: `npm test` (unit test for planned-vs-actual aggregation)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: view dashboard for a period with a mix of over/under categories

**Dependencies:** Task 10

**Files likely touched:**
- `app/(app)/dashboard/page.tsx`
- `lib/budget.ts` (aggregation logic)

**Estimated scope:** Medium: 3-5 files

---

## Task 12: CSV upload + staged parsing preview

**Description:** File upload UI for a CSV tied to a selected account, server-side parsing into a staged `ImportBatch` with row-level preview. Includes a column-mapping step (date/description/amount) since bank export formats vary.

**Acceptance criteria:**
- [ ] User selects an account and uploads a CSV
- [ ] User maps CSV columns to date/description/amount before parsing proceeds
- [ ] Preview shows each parsed row; rows with unparseable dates/amounts are flagged, not dropped
- [ ] Nothing is written to `Transaction` at this stage — only the staged `ImportBatch`/rows

**Verification:**
- [ ] Tests pass: `npm test` (CSV parsing unit tests with malformed-row fixtures)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: upload a sample CSV with one bad row, confirm it's flagged in the preview

**Dependencies:** Task 6

**Files likely touched:**
- `app/(app)/import/page.tsx`
- `app/(app)/import/actions.ts`
- `lib/csv.ts`

**Estimated scope:** Medium: 3-5 files

---

## Task 13: Category rules (CRUD + auto-categorize staged rows)

**Description:** CRUD UI for `CategoryRule` (matchType, pattern, category, priority) and logic to apply rules against staged import rows, pre-filling a category by priority order (first match wins).

**Acceptance criteria:**
- [ ] User can create/edit/delete category rules
- [ ] Staged import rows are pre-filled with a category when a rule matches
- [ ] When multiple rules match, the highest-priority rule wins
- [ ] Rows with no matching rule are left uncategorized (not blocked)

**Verification:**
- [ ] Tests pass: `npm test` (rule-matching unit tests: contains/exact/regex, priority ordering)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: create a rule, re-run categorization on a staged batch, confirm matches apply

**Dependencies:** Task 12, Task 7

**Files likely touched:**
- `app/(app)/rules/page.tsx`
- `app/(app)/rules/actions.ts`
- `lib/categorize.ts`

**Estimated scope:** Medium: 3-5 files

---

## Task 14: Import review/correct + commit to transactions

**Description:** In the staged import preview, let the user correct any wrong/missing categorization per row, optionally save a correction as a new `CategoryRule`, then commit the batch to create real `Transaction` rows.

**Acceptance criteria:**
- [ ] User can change the category of any staged row before committing
- [ ] User can opt to save a correction as a new rule for future imports
- [ ] Committing creates one `Transaction` per staged row (excluding any explicitly skipped) and marks the batch committed
- [ ] A committed batch cannot be committed again

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: correct a row's category, save it as a rule, commit the batch, confirm transactions appear in the list

**Dependencies:** Task 13

**Files likely touched:**
- `app/(app)/import/actions.ts`
- `app/(app)/import/ImportPreview.tsx`

**Estimated scope:** Medium: 3-5 files

---

## Task 15: Duplicate detection on commit

**Description:** Before committing a batch, check staged rows against existing transactions for the same account (matching date + amount + description) and flag likely duplicates, excluded from commit by default with an option to include them.

**Acceptance criteria:**
- [ ] Rows matching an existing transaction on account+date+amount+description are flagged as likely duplicates
- [ ] Flagged rows are excluded from commit by default
- [ ] User can override and include a flagged row if it's a legitimate repeat
- [ ] Non-flagged rows commit normally

**Verification:**
- [ ] Tests pass: `npm test` (duplicate-detection unit tests)
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: import a CSV containing a row identical to an existing transaction, confirm it's flagged and excluded by default

**Dependencies:** Task 14

**Files likely touched:**
- `lib/csv.ts` or `lib/duplicates.ts`
- `app/(app)/import/ImportPreview.tsx`

**Estimated scope:** Small: 1-2 files

---

## Task 16: Unit tests for core business logic

**Description:** Fill in any remaining unit test gaps for budget/allocation math, savings goal progress, CSV parsing, category rule matching, and duplicate detection — the pieces called out in the design spec's testing section that aren't already covered by earlier tasks' own verification steps.

**Acceptance criteria:**
- [ ] Budget planned-vs-actual aggregation has unit tests covering zero-allocation and over-budget cases
- [ ] Goal progress calculation has a unit test
- [ ] CSV parsing has unit tests for at least one malformed-row and one well-formed fixture
- [ ] Rule matching has unit tests for all three match types and priority ordering
- [ ] Duplicate detection has a unit test for a true positive and a true negative

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: none (test-only task)

**Dependencies:** Task 15

**Files likely touched:**
- `tests/lib/budget.test.ts`
- `tests/lib/goals.test.ts`
- `tests/lib/csv.test.ts`
- `tests/lib/categorize.test.ts`
- `tests/lib/duplicates.test.ts`

**Estimated scope:** Medium: 3-5 files

---

## Task 17: E2E happy-path test (Playwright)

**Description:** One Playwright test covering: sign up → create household → add a manual transaction → set a monthly budget → import a CSV and categorize it → view a savings goal's progress.

**Acceptance criteria:**
- [ ] Test runs against a clean, seeded test database
- [ ] Test covers every step in the happy path listed above in one flow
- [ ] Test passes reliably (no flaky waits/selectors)

**Verification:**
- [ ] Tests pass: `npx playwright test`
- [ ] Build succeeds: `npm run build`
- [ ] Manual check: run the E2E suite locally once, confirm green

**Dependencies:** Task 16

**Files likely touched:**
- `tests/e2e/happy-path.spec.ts`
- `playwright.config.ts`

**Estimated scope:** Medium: 3-5 files

---

## Task 18: Deployment configuration

**Description:** Configure the Vercel project and a production Neon database, wire up environment variables (DB URL, auth secrets), and document setup steps in the README.

**Acceptance criteria:**
- [ ] App builds and deploys successfully to a Vercel preview URL
- [ ] Production database is a separate Neon instance from local dev, with migrations applied
- [ ] README documents local setup (env vars, `prisma migrate`, seed, running tests)

**Verification:**
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build` (and Vercel's own build)
- [ ] Manual check: visit the deployed preview URL, sign up, confirm the app works end-to-end in production

**Dependencies:** Task 17

**Files likely touched:**
- `README.md`
- `vercel.json` (if needed)
- `.env.example`

**Estimated scope:** Small: 1-2 files
