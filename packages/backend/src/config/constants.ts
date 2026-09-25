/**
 * Single source of truth for the externally-tunable values in the
 * address-validation flow: the result-column header names and the thresholds
 * that decide where a sheet's column names and data rows begin.
 */

/** Header names for the result columns appended to the sponsor's spreadsheet. */
export const RESULT_COLUMNS = {
  standardized: "Standardized Address",
  deliverability: "Address Checks",
} as const;

/**
 * How many leading rows are searched for the column names. A legend or title block
 * sits above the names in some partners' exports; past this many rows a sheet is
 * malformed rather than merely decorated.
 */
export const HEADER_ROW_SCAN_LIMIT = 10;

/**
 * How full a row must be, against the fullest row scanned, to be taken for the
 * column names. A one- or two-cell legend falls well short; a name row does not.
 */
export const HEADER_ROW_MIN_DENSITY = 0.6;

/**
 * Filled cells a row below the names must have to count as a record. Sheets carry
 * whole columns filled down with one repeated value, and those rows are furniture.
 */
export const MIN_DATA_ROW_CELLS = 2;
