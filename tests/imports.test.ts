import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parseCsvRows } from "@/lib/csv";
import { createImportBatch, getImportBatch } from "@/lib/imports";

// Integration test against the real Postgres container (moneywrench-pg),
// following the same pattern tests/accounts.test.ts/tests/transactions.test.ts
// established: create real rows across two households, then assert that
// writes/reads scoped to household A's session never touch household B's
// data. Also proves two of this task's own ACs directly against the DB:
// (1) an account belonging to another household can't be used to create an
// import batch, and (2) nothing lands in the Transaction table as a result
// of this flow.

describe("imports household scoping and staging", () => {
  const runId = Date.now().toString();
  const householdAId = `test-household-a-${runId}`;
  const householdBId = `test-household-b-${runId}`;
  const userAId = `test-user-a-${runId}`;
  const accountAId = `test-account-a-${runId}`;
  const accountBId = `test-account-b-${runId}`;

  const batchIds: string[] = [];

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
        email: `import-user-a-${runId}@example.com`,
        name: "User A",
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
    await db.importRow.deleteMany({
      where: { importBatchId: { in: batchIds } },
    });
    await db.importBatch.deleteMany({ where: { id: { in: batchIds } } });
    await db.transaction.deleteMany({
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

  const sampleCsv = [
    "Date,Description,Amount",
    "2026-03-01,Good row,10.00",
    "garbled-date,Bad row,10.00",
  ].join("\n");
  const mapping = { dateColumn: 0, descriptionColumn: 1, amountColumn: 2 };

  it("creates an ImportBatch + ImportRows scoped to the caller's household, staging both good and flagged rows", async () => {
    const rows = parseCsvRows(sampleCsv, mapping);
    const batch = await createImportBatch(
      householdAId,
      accountAId,
      userAId,
      "sample.csv",
      rows,
    );
    batchIds.push(batch.id);

    const fetched = await getImportBatch(householdAId, batch.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.rows).toHaveLength(2);

    const goodRow = fetched!.rows.find((r) => r.rawDescription === "Good row");
    const badRow = fetched!.rows.find((r) => r.rawDescription === "Bad row");
    expect(goodRow?.parseError).toBeNull();
    expect(badRow?.parseError).toContain("invalid date format");

    // Fields owned by later tasks (13-15) are left untouched at their
    // schema defaults — this task must not populate them.
    expect(fetched!.committed).toBe(false);
    for (const row of fetched!.rows) {
      expect(row.categoryId).toBeNull();
      expect(row.isDuplicate).toBe(false);
      expect(row.includeInCommit).toBe(true);
      expect(row.committedTransactionId).toBeNull();
    }
  });

  it("refuses to create an import batch against an account belonging to another household", async () => {
    const rows = parseCsvRows(sampleCsv, mapping);

    // Household A's session tries to import into household B's account.
    await expect(
      createImportBatch(householdAId, accountBId, userAId, "sample.csv", rows),
    ).rejects.toThrow();

    // Nothing was created as a side effect of the rejected attempt.
    const batchesForAccountB = await db.importBatch.findMany({
      where: { accountId: accountBId },
    });
    expect(batchesForAccountB).toHaveLength(0);
  });

  it("does not let household A read household B's import batch", async () => {
    const rows = parseCsvRows(sampleCsv, mapping);
    const batchB = await db.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: { accountId: accountBId, filename: "b.csv", uploadedByUserId: userAId },
      });
      await tx.importRow.createMany({
        data: rows.map((row) => ({
          importBatchId: batch.id,
          rowIndex: row.rowIndex,
          rawDate: row.rawDate,
          rawDescription: row.rawDescription,
          rawAmount: row.rawAmount,
          parsedDate: row.parsedDate,
          parsedAmount: row.parsedAmount,
          parseError: row.parseError,
        })),
      });
      return batch;
    });
    batchIds.push(batchB.id);

    const fetchedByHouseholdA = await getImportBatch(householdAId, batchB.id);
    expect(fetchedByHouseholdA).toBeNull();

    const fetchedByHouseholdB = await getImportBatch(householdBId, batchB.id);
    expect(fetchedByHouseholdB).not.toBeNull();
  });

  it("writes nothing to the Transaction table as a result of staging an import", async () => {
    const beforeCount = await db.transaction.count({
      where: { householdId: { in: [householdAId, householdBId] } },
    });

    const rows = parseCsvRows(sampleCsv, mapping);
    const batch = await createImportBatch(
      householdAId,
      accountAId,
      userAId,
      "another.csv",
      rows,
    );
    batchIds.push(batch.id);

    const afterCount = await db.transaction.count({
      where: { householdId: { in: [householdAId, householdBId] } },
    });
    expect(afterCount).toBe(beforeCount);
    expect(afterCount).toBe(0);
  });
});
