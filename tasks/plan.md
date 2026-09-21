# Implementation Plan: MoneyWrench Budget & Savings Tracker

## Overview

Build the Next.js/Postgres household budget tracker described in
`docs/superpowers/specs/2026-09-20-budget-tracker-design.md`. Household
members define monthly budgets (overall + per-category), track savings
goals, and log transactions manually or via CSV import with rule-based
categorization. Work proceeds bottom-up: project scaffolding and auth
first, then core CRUD, then budgeting/goals, then CSV import, then
tests/polish.

## Architecture Decisions

- Next.js (App Router, TypeScript) monolith, Postgres via Prisma, Auth.js
  for household-scoped auth, deployed to Vercel — per the approved design
  spec, chosen over a split frontend/backend to minimize ops overhead.
- Savings goals are modeled as a special category kind (`savings_goal`);
  contributions are ordinary transactions, so there's no separate
  contribution entity or dual-write path to keep in sync.
- CSV import is staged (`ImportBatch` + preview) before commit, so bad
  parses or wrong categorizations never land directly as `Transaction`
  rows.

## Task List

### Phase 1: Foundation

- [ ] Task 1: Scaffold Next.js project
- [ ] Task 2: Household/User schema + Postgres connection
- [ ] Task 3: Auth.js signup/login with household scoping
- [ ] Task 4: Household invite flow

### Checkpoint: Foundation
- [ ] Build, lint, and test commands all pass
- [ ] A new user can sign up (creating a household), log out, log back in
- [ ] A second user can join the same household via an invite link
- [ ] Review with human before proceeding

### Phase 2: Core Domain CRUD

- [ ] Task 5: Domain schema (Account, Category, SavingsGoal, BudgetPeriod,
      BudgetAllocation, Transaction, ImportBatch, CategoryRule)
- [ ] Task 6: Accounts CRUD
- [ ] Task 7: Categories CRUD
- [ ] Task 8: Manual transaction entry + list

### Checkpoint: Core CRUD
- [ ] User can create accounts and categories
- [ ] User can log a manual transaction and see it in a filterable list
- [ ] Data is correctly scoped to the logged-in user's household
- [ ] Review with human before proceeding

### Phase 3: Budgeting & Goals

- [ ] Task 9: Savings goals (create + computed progress)
- [ ] Task 10: Monthly budget periods + allocations
- [ ] Task 11: Budget dashboard (planned vs. actual, over/under indicators)

### Checkpoint: Budgeting (MVP without import)
- [ ] User can set a monthly budget (overall + per category)
- [ ] User can create a savings goal and see its progress update as they
      log transactions to it
- [ ] Dashboard correctly shows planned vs. actual and flags over-budget
      categories
- [ ] Review with human before proceeding

### Phase 4: CSV Import

- [ ] Task 12: CSV upload + staged parsing preview
- [ ] Task 13: Category rules (CRUD + auto-categorize staged rows)
- [ ] Task 14: Import review/correct + commit to transactions
- [ ] Task 15: Duplicate detection on commit

### Checkpoint: Import
- [ ] User can upload a CSV, see auto-categorized rows, correct any
      wrong/missing categories, and commit them as transactions
- [ ] Likely duplicates are flagged and excluded by default
- [ ] Review with human before proceeding

### Phase 5: Testing & Polish

- [ ] Task 16: Unit tests for core business logic
- [ ] Task 17: E2E happy-path test (Playwright)
- [ ] Task 18: Deployment configuration

### Checkpoint: Complete
- [ ] All acceptance criteria across tasks 1-18 met
- [ ] E2E happy path passes in CI or locally against a clean database
- [ ] App is deployed and reachable
- [ ] Ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Auth.js has no built-in "household" concept — sessions are per-user | Med | Model household membership as app data; populate `householdId` onto the session via an Auth.js callback (Task 3) |
| Bank CSV export formats vary (columns, date formats, delimiters) | Med | Task 12 includes an explicit column-mapping step in the import preview rather than assuming a fixed schema |
| Duplicate detection false positives/negatives | Low | Always user-overridable; never silently and irreversibly excludes a row (Task 15) |
| Scope creep into investment tracking or multi-currency | Low | Explicitly out of scope per the design spec; flag if any task starts requiring it |

## Open Questions

None blocking — CSV column-mapping and bank format handling are resolved
as part of Task 12's design rather than needing a decision now.
