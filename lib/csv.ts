import { parse } from "csv-parse/sync";

/**
 * Pure CSV parsing logic for the import flow (Task 12). No DB calls live
 * here — callers (app/(app)/import/actions.ts) are responsible for turning
 * the output of this file into ImportBatch/ImportRow rows. Keeping this
 * pure is what makes it unit-testable with plain string fixtures (malformed
 * dates/amounts, missing fields) without touching Postgres.
 */

export type CsvPreview = {
  /** The CSV's header row, verbatim. */
  headers: string[];
  /** First few data rows (not the header), for the column-mapping step's preview. */
  sampleRows: string[][];
  /** Total number of data rows (excluding the header) in the whole file. */
  totalRows: number;
};

export type ColumnMapping = {
  /** 0-based index into each data row identifying the date column. */
  dateColumn: number;
  descriptionColumn: number;
  amountColumn: number;
};

export type ParsedCsvRow = {
  /** 0-based position of this row among the CSV's data rows (excludes header), for stable display order. */
  rowIndex: number;
  rawDate: string;
  rawDescription: string;
  rawAmount: string;
  parsedDate: Date | null;
  /** Decimal amount as a normalized string (e.g. "-42.50"), or null if unparseable. */
  parsedAmount: string | null;
  /** Human-readable reason the row failed to parse, or null if it parsed cleanly. */
  parseError: string | null;
};

/**
 * Splits raw CSV text into a header row + data rows using csv-parse, which
 * handles RFC 4180 quoting/escaping (quoted fields containing commas or
 * newlines) that a hand-rolled `.split(",")` would get wrong.
 * `relax_column_count` tolerates ragged real-world bank exports (a row with
 * fewer/more fields than the header) rather than throwing — missing values
 * surface later as per-row parse errors instead of aborting the whole file.
 */
function splitCsv(csvText: string): { headers: string[]; dataRows: string[][] } {
  const records: string[][] = parse(csvText, {
    columns: false,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  if (records.length === 0) {
    return { headers: [], dataRows: [] };
  }

  const [headers, ...dataRows] = records;
  return { headers, dataRows };
}

/**
 * Parses just the header + a sample of rows, for the upload step's preview
 * (before the user has chosen a column mapping). Cheap even for a large
 * file since it still parses the whole thing, but does no date/amount
 * interpretation.
 */
export function previewCsv(csvText: string, sampleSize = 5): CsvPreview {
  const { headers, dataRows } = splitCsv(csvText);
  return {
    headers,
    sampleRows: dataRows.slice(0, sampleSize),
    totalRows: dataRows.length,
  };
}

/** Matches "YYYY-MM-DD" (ISO). */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Matches "M/D/YYYY" or "MM/DD/YYYY" (common US bank export format). */
const US_SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * Parses a single date cell. Deliberately supports only two explicit,
 * unambiguous formats (ISO and US M/D/YYYY) rather than delegating to
 * `new Date(raw)` — the built-in parser accepts a wide, inconsistent grab
 * bag of formats and is timezone-sensitive, which would make parsing
 * non-deterministic across environments and impossible to unit test
 * reliably. Anything else is reported as a parse error rather than guessed
 * at.
 */
function parseDateValue(raw: string): Date | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }

  const isoMatch = ISO_DATE.exec(trimmed);
  if (isoMatch) {
    const [, yearStr, monthStr, dayStr] = isoMatch;
    return dateFromParts(Number(yearStr), Number(monthStr), Number(dayStr));
  }

  const usMatch = US_SLASH_DATE.exec(trimmed);
  if (usMatch) {
    const [, monthStr, dayStr, yearStr] = usMatch;
    return dateFromParts(Number(yearStr), Number(monthStr), Number(dayStr));
  }

  return null;
}

/** Builds a UTC Date from year/month(1-12)/day, rejecting out-of-range values (e.g. month 13, Feb 30) instead of letting them silently roll over into the next month like the native Date constructor does. */
function dateFromParts(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject values that don't round-trip (e.g. 2026-02-30 rolls over to
  // March 2 in JS's Date, which we don't want to accept as valid).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Parses a single amount cell into a normalized decimal string (e.g.
 * "-42.50"), tolerating common bank-export conventions: a leading currency
 * symbol, thousands separators, and parentheses to denote a negative amount
 * (e.g. "($42.50)" -> "-42.50"). Returns null if what's left over isn't a
 * plain number.
 */
function parseAmountValue(raw: string): string | null {
  let trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }

  let negative = false;
  const parenMatch = /^\((.*)\)$/.exec(trimmed);
  if (parenMatch) {
    negative = true;
    trimmed = parenMatch[1].trim();
  }

  // Strip a leading currency symbol (e.g. "$", "USD ") and thousands commas.
  let cleaned = trimmed.replace(/^[A-Za-z$€£]+\s*/, "").replace(/,/g, "");

  if (cleaned.startsWith("-")) {
    negative = true;
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }

  return negative ? `-${cleaned}` : cleaned;
}

/**
 * Parses the FULL CSV against a chosen column mapping, producing one row
 * per data row (header excluded). Every data row produces exactly one
 * ParsedCsvRow — rows with an unparseable date/amount or a missing mapped
 * value are included with a non-null `parseError`, never silently dropped,
 * per this task's AC.
 */
export function parseCsvRows(
  csvText: string,
  mapping: ColumnMapping,
): ParsedCsvRow[] {
  const { dataRows } = splitCsv(csvText);

  return dataRows.map((row, rowIndex) => {
    const rawDate = row[mapping.dateColumn] ?? "";
    const rawDescription = row[mapping.descriptionColumn] ?? "";
    const rawAmount = row[mapping.amountColumn] ?? "";

    const errors: string[] = [];

    let parsedDate: Date | null = null;
    if (rawDate.trim() === "") {
      errors.push("missing date");
    } else {
      parsedDate = parseDateValue(rawDate);
      if (!parsedDate) {
        errors.push("invalid date format");
      }
    }

    let parsedAmount: string | null = null;
    if (rawAmount.trim() === "") {
      errors.push("missing amount");
    } else {
      parsedAmount = parseAmountValue(rawAmount);
      if (!parsedAmount) {
        errors.push("invalid amount");
      }
    }

    return {
      rowIndex,
      rawDate,
      rawDescription,
      rawAmount,
      parsedDate,
      parsedAmount,
      parseError: errors.length > 0 ? errors.join("; ") : null,
    };
  });
}
