import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { findDuplicateRowIds, type RowForDuplicateCheck } from "@/lib/duplicates";

// Pure unit tests — no DB, no Postgres container needed, same as
// tests/categorize.test.ts.

function row(overrides: Partial<RowForDuplicateCheck> & { id: string }): RowForDuplicateCheck {
  return {
    parsedDate: new Date("2026-04-01T00:00:00.000Z"),
    parsedAmount: "-4.50",
    rawDescription: "STARBUCKS STORE #1",
    ...overrides,
  };
}

const existingCoffee = {
  date: new Date("2026-04-01T00:00:00.000Z"),
  amount: new Prisma.Decimal("4.50"),
  type: "expense" as const,
  description: "STARBUCKS STORE #1",
};

describe("findDuplicateRowIds", () => {
  it("flags a row matching an existing transaction on date + amount + description", () => {
    const rows = [row({ id: "row-1" })];
    expect(findDuplicateRowIds(rows, [existingCoffee])).toEqual(new Set(["row-1"]));
  });

  it("does not flag a row when the description differs", () => {
    const rows = [row({ id: "row-1", rawDescription: "Different Store" })];
    expect(findDuplicateRowIds(rows, [existingCoffee]).size).toBe(0);
  });

  it("does not flag a row when the date differs", () => {
    const rows = [row({ id: "row-1", parsedDate: new Date("2026-04-02T00:00:00.000Z") })];
    expect(findDuplicateRowIds(rows, [existingCoffee]).size).toBe(0);
  });

  it("does not flag a row when the amount differs", () => {
    const rows = [row({ id: "row-1", parsedAmount: "-5.00" })];
    expect(findDuplicateRowIds(rows, [existingCoffee]).size).toBe(0);
  });

  it("does not flag a row whose sign implies the opposite type (expense vs income)", () => {
    // Same magnitude and date/description, but positive (income) instead
    // of negative (expense) — a deposit is not a duplicate of a charge.
    const rows = [row({ id: "row-1", parsedAmount: "4.50" })];
    expect(findDuplicateRowIds(rows, [existingCoffee]).size).toBe(0);
  });

  it("treats differing trailing-zero formatting as the same amount ('4.5' vs '4.50')", () => {
    const rows = [row({ id: "row-1", parsedAmount: "-4.5" })];
    expect(findDuplicateRowIds(rows, [existingCoffee])).toEqual(new Set(["row-1"]));
  });

  it("skips rows with no parsed date or amount (parse errors) without throwing", () => {
    const rows = [
      row({ id: "row-1", parsedDate: null }),
      row({ id: "row-2", parsedAmount: null }),
    ];
    expect(findDuplicateRowIds(rows, [existingCoffee]).size).toBe(0);
  });

  it("only flags rows that actually match — mixed batch", () => {
    const rows = [
      row({ id: "row-1" }),
      row({ id: "row-2", rawDescription: "Random Grocery Store", parsedAmount: "-25.00" }),
    ];
    expect(findDuplicateRowIds(rows, [existingCoffee])).toEqual(new Set(["row-1"]));
  });
});
