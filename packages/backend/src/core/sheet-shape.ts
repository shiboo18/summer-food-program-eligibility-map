import { HEADER_ROW_MIN_DENSITY, HEADER_ROW_SCAN_LIMIT, MIN_DATA_ROW_CELLS } from "../config/constants.js";

/** Where a sheet's column names are, and what they are. */
export interface HeaderRow {
  /** 1-based sheet row the names came from. Data begins on the row after it. */
  readonly rowNumber: number;
  /**
   * Column names by position: `headers[i]` names column `i + 1`. An unnamed column
   * inside the row is kept as an empty string so the position stays true; blanks
   * after the last named column are dropped.
   */
  readonly headers: readonly string[];
}

/**
 * Finds the row holding the column names among the first rows of a sheet.
 *
 * Partners' exports often open with a legend or title — a row or two with one or
 * two filled cells — above the real names, so the top row cannot be assumed. The
 * name row is taken to be the first one filled to [HEADER_ROW_MIN_DENSITY] of the
 * widest row scanned; a legend falls far short of that. A sheet whose name row is
 * emptier than its data rows by that margin is not recognised.
 *
 * @param rows Leading rows as positional cell text, blanks included.
 * @returns The names and their row, or null when no row qualifies.
 */
export function findHeaderRow(rows: readonly (readonly string[])[]): HeaderRow | null {
  const scanned = rows.slice(0, HEADER_ROW_SCAN_LIMIT).map((row) => row.map((cell) => cell.trim()));
  const filled = scanned.map((row) => row.filter((cell) => cell.length > 0).length);
  const widest = Math.max(0, ...filled);
  if (widest === 0) {
    return null;
  }

  const index = filled.findIndex((count) => count >= widest * HEADER_ROW_MIN_DENSITY);
  const row = scanned[index];
  if (row === undefined) {
    return null;
  }

  const lastNamed = row.findLastIndex((cell) => cell.length > 0);
  return { rowNumber: index + 1, headers: row.slice(0, lastNamed + 1) };
}

/**
 * Whether a row below the names looks like a record rather than sheet furniture.
 *
 * A column filled to the bottom of the sheet with one repeated value — a stray
 * fill-down — would otherwise make every row of a mostly empty sheet count as
 * data, so a record has to fill at least [MIN_DATA_ROW_CELLS] cells.
 */
export function isDataRow(cells: readonly string[]): boolean {
  return cells.filter((cell) => cell.trim().length > 0).length >= MIN_DATA_ROW_CELLS;
}
