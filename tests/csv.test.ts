import { describe, expect, it } from "vitest";
import { parseCsvRows, previewCsv } from "@/lib/csv";

// Pure unit tests for lib/csv.ts — no DB involved. Covers both well-formed
// rows (various date/amount conventions a real bank export might use) and
// malformed-row fixtures (bad date, bad amount, missing field) per this
// task's verification step: malformed rows must be flagged via
// `parseError`, never dropped from the output.

describe("previewCsv", () => {
  it("splits header from data rows and reports total row count", () => {
    const csv = "Date,Description,Amount\n2026-01-01,Coffee,4.50\n2026-01-02,Rent,-1200.00\n";
    const preview = previewCsv(csv);
    expect(preview.headers).toEqual(["Date", "Description", "Amount"]);
    expect(preview.totalRows).toBe(2);
    expect(preview.sampleRows).toEqual([
      ["2026-01-01", "Coffee", "4.50"],
      ["2026-01-02", "Rent", "-1200.00"],
    ]);
  });

  it("limits the sample to sampleSize rows without affecting totalRows", () => {
    const rows = Array.from({ length: 10 }, (_, i) => `2026-01-0${(i % 9) + 1},Row ${i},1.00`);
    const csv = `Date,Description,Amount\n${rows.join("\n")}\n`;
    const preview = previewCsv(csv, 3);
    expect(preview.sampleRows).toHaveLength(3);
    expect(preview.totalRows).toBe(10);
  });

  it("returns empty headers/rows for an empty file", () => {
    const preview = previewCsv("");
    expect(preview.headers).toEqual([]);
    expect(preview.sampleRows).toEqual([]);
    expect(preview.totalRows).toBe(0);
  });
});

describe("parseCsvRows", () => {
  const mapping = { dateColumn: 0, descriptionColumn: 1, amountColumn: 2 };

  it("parses well-formed ISO-date rows with no error", () => {
    const csv = "Date,Description,Amount\n2026-03-15,Weekly groceries,42.50\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row.parseError).toBeNull();
    expect(row.parsedDate).toEqual(new Date(Date.UTC(2026, 2, 15)));
    expect(row.parsedAmount).toBe("42.50");
    expect(row.rawDate).toBe("2026-03-15");
    expect(row.rawDescription).toBe("Weekly groceries");
    expect(row.rawAmount).toBe("42.50");
    expect(row.rowIndex).toBe(0);
  });

  it("parses well-formed US-slash-date rows with no error", () => {
    const csv = "Date,Description,Amount\n3/5/2026,Coffee,4.5\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row.parseError).toBeNull();
    expect(row.parsedDate).toEqual(new Date(Date.UTC(2026, 2, 5)));
    expect(row.parsedAmount).toBe("4.5");
  });

  it("parses negative amounts written with a leading minus", () => {
    const csv = "Date,Description,Amount\n2026-03-15,Rent,-1200.00\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row.parseError).toBeNull();
    expect(row.parsedAmount).toBe("-1200.00");
  });

  it("parses parenthesized amounts as negative (common bank export convention)", () => {
    const csv = "Date,Description,Amount\n2026-03-15,Refund reversal,($42.50)\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row.parseError).toBeNull();
    expect(row.parsedAmount).toBe("-42.50");
  });

  it("parses currency-symbol and thousands-separator amounts", () => {
    const csv = "Date,Description,Amount\n2026-03-15,Big purchase,\"$1,234.56\"\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row.parseError).toBeNull();
    expect(row.parsedAmount).toBe("1234.56");
  });

  it("handles quoted fields containing commas correctly (RFC 4180)", () => {
    const csv = 'Date,Description,Amount\n2026-03-15,"Groceries, weekly",42.50\n';
    const [row] = parseCsvRows(csv, mapping);
    expect(row.rawDescription).toBe("Groceries, weekly");
    expect(row.parseError).toBeNull();
  });

  it("flags a row with an unparseable (garbled) date, without dropping it", () => {
    const csv = "Date,Description,Amount\nnot-a-date,Mystery charge,10.00\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row).toBeDefined();
    expect(row.parseError).toContain("invalid date format");
    expect(row.parsedDate).toBeNull();
    // Other fields still captured even though the row is flagged.
    expect(row.rawDate).toBe("not-a-date");
    expect(row.rawDescription).toBe("Mystery charge");
    expect(row.parsedAmount).toBe("10.00");
  });

  it("flags a row with an out-of-range date (e.g. Feb 30) as invalid", () => {
    const csv = "Date,Description,Amount\n2026-02-30,Bad date,10.00\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row.parseError).toContain("invalid date format");
    expect(row.parsedDate).toBeNull();
  });

  it("flags a row with an unparseable amount, without dropping it", () => {
    const csv = "Date,Description,Amount\n2026-03-15,Mystery amount,not-a-number\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row.parseError).toContain("invalid amount");
    expect(row.parsedAmount).toBeNull();
    expect(row.parsedDate).not.toBeNull();
  });

  it("flags a row with a missing (empty) date cell", () => {
    const csv = "Date,Description,Amount\n,No date charge,10.00\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row.parseError).toContain("missing date");
    expect(row.parsedDate).toBeNull();
  });

  it("flags a row with a missing (empty) amount cell", () => {
    const csv = "Date,Description,Amount\n2026-03-15,No amount charge,\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row.parseError).toContain("missing amount");
    expect(row.parsedAmount).toBeNull();
  });

  it("reports multiple errors for a row with both a bad date and a bad amount", () => {
    const csv = "Date,Description,Amount\ngarbled,Double trouble,garbled\n";
    const [row] = parseCsvRows(csv, mapping);
    expect(row.parseError).toContain("invalid date format");
    expect(row.parseError).toContain("invalid amount");
  });

  it("keeps every row in original order, mixing good and bad rows without dropping any", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-03-01,Good row one,10.00",
      "garbled-date,Bad row,10.00",
      "2026-03-03,Good row two,20.00",
      "2026-03-04,Bad amount row,not-a-number",
    ].join("\n");
    const rows = parseCsvRows(csv, mapping);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.rowIndex)).toEqual([0, 1, 2, 3]);
    expect(rows[0].parseError).toBeNull();
    expect(rows[1].parseError).not.toBeNull();
    expect(rows[2].parseError).toBeNull();
    expect(rows[3].parseError).not.toBeNull();
  });

  it("respects an arbitrary column mapping order (not assuming date/description/amount order in the file)", () => {
    const csv = "Amount,Date,Memo\n42.50,2026-03-15,Weekly groceries\n";
    const reordered = { dateColumn: 1, descriptionColumn: 2, amountColumn: 0 };
    const [row] = parseCsvRows(csv, reordered);
    expect(row.parseError).toBeNull();
    expect(row.rawDescription).toBe("Weekly groceries");
    expect(row.parsedAmount).toBe("42.50");
  });
});
