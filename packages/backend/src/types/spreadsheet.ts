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

/** One row's verification result to annotate back into the spreadsheet. */
export interface ResultAnnotation {
  readonly rowNumber: number;
  readonly deliverability: DeliverabilityLabel;
  /** The standardized address, present only when the input was corrected. */
  readonly standardizedAddress?: string;
}

/** Header names for the appended result columns (kept in config, passed through). */
export interface ResultColumns {
  readonly standardized: string;
  readonly deliverability: string;
}

/** Which result columns to write, and where to write them. */
export interface ResultColumnOptions {
  /** Which result columns to add and their header names. */
  readonly columns: ResultColumns;
  /** Where to write the annotated copy. The partner's original is never written to. */
  readonly outputPath: string;
}
