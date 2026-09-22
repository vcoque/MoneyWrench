import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { archiveAccount, createAccount, listAccounts } from "@/lib/accounts";

// Integration test against the real Postgres container (moneywrench-pg) —
// no precedent for DB-backed tests existed before this task, so this
// establishes the pattern: create real rows across two households, then
// assert that queries/mutations scoped to household A's session never
// see or affect household B's data. This is the concrete proof for the
// design spec's "every query is scoped by householdId" rule and this
// task's AC ("a user from a different household cannot see or modify
// another household's accounts") — not just an assumption.
//
// Uses unique per-run ids (Date.now()-suffixed) so repeated local runs
// don't collide with leftover rows, and cleans up everything it creates
// in `afterAll`.

describe("accounts household scoping", () => {
  const runId = Date.now().toString();
  const householdAId = `test-household-a-${runId}`;
  const householdBId = `test-household-b-${runId}`;

  beforeAll(async () => {
    await db.household.create({
      data: { id: householdAId, name: "Household A", currency: "USD" },
    });
    await db.household.create({
      data: { id: householdBId, name: "Household B", currency: "USD" },
    });
  });

  afterAll(async () => {
    // Accounts cascade-delete isn't configured (RESTRICT by default per
    // Task 5), so delete children before parents.
    await db.account.deleteMany({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    await db.household.deleteMany({
      where: { id: { in: [householdAId, householdBId] } },
    });
  });

  it("does not let household A see household B's accounts in its list", async () => {
    const accountA = await createAccount(
      householdAId,
      "A Checking",
      "checking",
    );
    const accountB = await createAccount(householdBId, "B Savings", "savings");

    const householdAAccounts = await listAccounts(householdAId);
    const householdBAccounts = await listAccounts(householdBId);

    expect(householdAAccounts.map((a) => a.id)).toContain(accountA.id);
    expect(householdAAccounts.map((a) => a.id)).not.toContain(accountB.id);

    expect(householdBAccounts.map((a) => a.id)).toContain(accountB.id);
    expect(householdBAccounts.map((a) => a.id)).not.toContain(accountA.id);
  });

  it("does not let household A archive household B's account", async () => {
    const accountB = await createAccount(
      householdBId,
      "B Credit Card",
      "credit_card",
    );

    // Household A's session tries to archive an account it doesn't own.
    const archived = await archiveAccount(householdAId, accountB.id);
    expect(archived).toBe(false);

    // The account is untouched: still exists, still non-archived, still
    // visible to its real household's list.
    const stillThere = await db.account.findUniqueOrThrow({
      where: { id: accountB.id },
    });
    expect(stillThere.isArchived).toBe(false);

    const householdBAccounts = await listAccounts(householdBId);
    expect(householdBAccounts.map((a) => a.id)).toContain(accountB.id);
  });

  it("archiving within the owning household hides the account from the list but keeps the row", async () => {
    const account = await createAccount(householdAId, "To Archive", "cash");

    const archived = await archiveAccount(householdAId, account.id);
    expect(archived).toBe(true);

    const accounts = await listAccounts(householdAId);
    expect(accounts.map((a) => a.id)).not.toContain(account.id);

    // Soft delete only — the row itself still exists, flagged archived.
    const row = await db.account.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(row.isArchived).toBe(true);
  });
});
