import type { Address } from "./address.js";

export interface SpreadsheetSummary {
  readonly filePath: string;
  readonly fileName: string;
  /**
   * Column names by position: `headers[i]` names column `i + 1`. A column with no
   * name is an empty string, so a gap never shifts the columns after it.
   */
  readonly headers: readonly string[];
  /** 1-based row the names came from; a legend or title block can sit above it. */
  readonly headerRowNumber: number;
  /** Rows below the names that hold a record, ignoring blank and filled-down rows. */
  readonly rowCount: number;
}

/** Spreadsheet header names chosen by the user for each address field. */
export interface ColumnMapping {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
}

export interface AddressRow {
  readonly rowNumber: number;
  readonly address: Address;
}

export interface SkippedRow {
  readonly rowNumber: number;
  readonly reason: string;
}

export interface AddressRowsResult {
  readonly rows: readonly AddressRow[];
  readonly skipped: readonly SkippedRow[];
}

/** Sponsor-readable deliverability verdict written into the results column. */
export type DeliverabilityLabel = "Valid" | "Valid and corrected" | "Invalid";

/**
 * Sponsor-readable rural verdict; "Not Verified" when the row was not checked.
 * The "(approximate location)" variants hedge the verdict when the row was
 * placed too coarsely to trust which block group it fell in.
 */
export type RuralLabel =
  | "Rural"
  | "Not Rural"
  | "Not Verified"
  | "Rural (approximate location)"
  | "Not Rural (approximate location)";

/**
 * Sponsor-readable USDA area-eligibility verdict; "Not Verified" when the row
 * was undeliverable or its check produced no result. The "(approximate
 * location)" variants hedge the verdict when the location was too coarse to
 * trust which block group it fell in.
 */
export type AreaLabel =
  | "In Area — Eligible"
  | "In Area — Averaged"
  | "Not Eligible"
  | "Not Verified"
  | "In Area — Eligible (approximate location)"
  | "In Area — Averaged (approximate location)"
  | "Not Eligible (approximate location)";

/**
 * Sponsor-readable location precision in plain language, worst to best: how
 * tightly the row was placed, which decides whether its block group can be
 * trusted. "Exact address" and "Street level" are trusted; "ZIP area" and "Town
 * area" are only approximate; "Not located" means no coordinate was resolved.
 */
export type LocationLabel = "Exact address" | "Street level" | "ZIP area" | "Town area" | "Not located";

/**
 * One row's check results to annotate back into the spreadsheet. Only the
 * columns for checks that were run are present; absent fields leave that cell
 * blank rather than writing "Not Verified".
 */
export interface ResultAnnotation {
  readonly rowNumber: number;
  readonly deliverability: DeliverabilityLabel;
  /** The standardized address, present only when the input was corrected. */
  readonly standardizedAddress?: string;
  /** How precisely the row was located. */
  readonly location?: LocationLabel;
  readonly rural?: RuralLabel;
  readonly area?: AreaLabel;
}

/** Header names for the appended result columns (kept in config, passed through). */
export interface ResultColumns {
  readonly standardized: string;
  readonly deliverability: string;
  readonly location: string;
  readonly rural: string;
  readonly area: string;
}

/** Which result columns to write, and where to write them. */
export interface ResultColumnOptions {
  /** Which result columns to add and their header names. */
  readonly columns: ResultColumns;
  /** Whether the rural / area columns should be written (checks that ran). */
  readonly includeRural: boolean;
  readonly includeArea: boolean;
  /** Where to write the annotated copy. The partner's original is never written to. */
  readonly outputPath: string;
}
