/**
 * Header cell references such as `A1` or `AB1`. Only the column letters identify
 * the column; the row is accepted so the reference reads like a spreadsheet cell.
 */
const cellPattern = /^([A-Za-z]{1,3})([0-9]{1,7})$/;

export function isCellReference(value: string): boolean {
  return cellPattern.test(value.trim());
}

/** Resolves a header cell such as `B1` to its 1-based column number, or undefined. */
export function columnNumberFromCell(value: string): number | undefined {
  const match = cellPattern.exec(value.trim());
  if (match === null) {
    return undefined;
  }

  let column = 0;
  for (const letter of match[1].toUpperCase()) {
    column = column * 26 + (letter.charCodeAt(0) - 64);
  }
  return column;
}

/** The row of a header cell such as `B1`, or undefined when it is not a cell. */
export function rowNumberFromCell(value: string): number | undefined {
  const match = cellPattern.exec(value.trim());
  return match === null ? undefined : Number(match[2]);
}

/** The cell for a 1-based column in the given row, so column 2 row 1 is `B1`. */
export function cellAtColumn(column: number, row: number): string {
  let letters = "";
  let remaining = column;
  while (remaining > 0) {
    const index = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + index) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return `${letters}${row}`;
}

/**
 * The column name at a header cell, when the sheet is that wide and names that
 * column. A column left unnamed reads as no column at all, so a cell pointing at
 * one is treated the same as a cell past the last column.
 */
export function headerAtCell(value: string, headers: readonly string[]): string | undefined {
  const column = columnNumberFromCell(value);
  if (column === undefined) {
    return undefined;
  }
  const header = headers[column - 1];
  return header === undefined || header.length === 0 ? undefined : header;
}
