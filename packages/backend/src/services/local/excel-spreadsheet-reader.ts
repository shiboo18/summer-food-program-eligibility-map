import { access, constants } from "node:fs/promises";
import { basename } from "node:path";

import ExcelJS from "exceljs";

import { HEADER_ROW_SCAN_LIMIT } from "../../config/constants.js";
import { parseAddress } from "../../core/address-shape.js";
import { findHeaderRow, isDataRow, type HeaderRow } from "../../core/sheet-shape.js";
import type { SpreadsheetReader, SpreadsheetWriter } from "../../contracts.js";
import type {
  AddressRow,
  AddressRowsResult,
  ColumnMapping,
  ResultAnnotation,
  ResultColumnOptions,
  SkippedRow,
  SpreadsheetSummary,
} from "../../types/spreadsheet.js";

/** Cell fills for the color-coded result columns (ARGB, solid). */
const goodFill = "FFDDF3DD";
const badFill = "FFF6D6D6";
const correctedFill = "FFFCE9C8";
const neutralFill = "FFF2F2F2";

/** Reads and updates Excel workbooks with ExcelJS so no custom spreadsheet parsing is required. */
export class ExcelSpreadsheetReader implements SpreadsheetReader, SpreadsheetWriter {
  public async readSummary(filePath: string): Promise<SpreadsheetSummary> {
    const sheet = await loadFirstSheet(filePath);
    const { rowNumber, headers } = requireHeaderRow(sheet);

    return {
      filePath,
      fileName: basename(filePath),
      headers,
      headerRowNumber: rowNumber,
      rowCount: countDataRows(sheet, rowNumber, headers.length),
    };
  }

  public async readAddressRows(filePath: string, mapping: ColumnMapping): Promise<AddressRowsResult> {
    const sheet = await loadFirstSheet(filePath);
    const { rowNumber: headerRowNumber, headers } = requireHeaderRow(sheet);
    const rows: AddressRow[] = [];
    const skipped: SkippedRow[] = [];

    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const line1 = cellText(row, headers, mapping.line1);
      const city = cellText(row, headers, mapping.city);
      const state = cellText(row, headers, mapping.state);
      const postalCode = cellText(row, headers, mapping.postalCode);
      const line2 = mapping.line2 === undefined ? "" : cellText(row, headers, mapping.line2);

      const parsed = parseAddress({ line1, line2, city, state, postalCode });
      if (parsed.kind === "blank") {
        continue;
      }
      if (parsed.kind === "invalid") {
        skipped.push({ rowNumber, reason: parsed.reason });
        continue;
      }
      rows.push({ rowNumber, address: parsed.address });
    }

    return { rows, skipped };
  }

  public async annotateResults(
    filePath: string,
    annotations: readonly ResultAnnotation[],
    options: ResultColumnOptions,
  ): Promise<void> {
    const sheet = await loadFirstSheet(filePath);
    const { columns } = options;
    /* The USDA columns are added only when a check ran, so a validation-only
       run exports exactly the columns it always did. */
    const wanted = [
      columns.standardized,
      columns.deliverability,
      ...(annotations.some((annotation) => annotation.rural !== undefined) ? [columns.rural] : []),
      ...(annotations.some((annotation) => annotation.area !== undefined) ? [columns.area] : []),
      ...(annotations.some((annotation) => annotation.ready !== undefined) ? [columns.ready] : []),
    ];

    const { rowNumber: headerRowNumber, headers } = requireHeaderRow(sheet);
    const columnAt = new Map<string, number>();
    let nextColumn = headers.length + 1;
    for (const header of wanted) {
      const existing = headers.indexOf(header);
      if (existing >= 0) {
        columnAt.set(header, existing + 1);
        continue;
      }
      sheet.getRow(headerRowNumber).getCell(nextColumn).value = header;
      columnAt.set(header, nextColumn);
      /* Widen and wrap the columns we add so the partner reads them without
         resizing; the standardized address is the longest, so it gets more room. */
      const column = sheet.getColumn(nextColumn);
      column.width = header === columns.standardized ? 36 : 18;
      column.alignment = { wrapText: true, vertical: "top" };
      nextColumn += 1;
    }
    sheet.getRow(headerRowNumber).commit();

    for (const annotation of annotations) {
      const row = sheet.getRow(annotation.rowNumber);
      if (annotation.standardizedAddress !== undefined) {
        setResultCell(row, columnAt, columns.standardized, annotation.standardizedAddress, correctedFill);
      }
      setResultCell(row, columnAt, columns.deliverability, annotation.deliverability, fillFor(annotation.deliverability));
      if (annotation.rural !== undefined) {
        setResultCell(row, columnAt, columns.rural, annotation.rural, fillFor(annotation.rural));
      }
      if (annotation.area !== undefined) {
        setResultCell(row, columnAt, columns.area, annotation.area, fillFor(annotation.area));
      }
      if (annotation.ready !== undefined) {
        setResultCell(row, columnAt, columns.ready, annotation.ready, fillFor(annotation.ready));
      }
      row.commit();
    }

    await sheet.workbook.xlsx.writeFile(options.outputPath);
  }
}

function setResultCell(
  row: ExcelJS.Row,
  columnAt: ReadonlyMap<string, number>,
  header: string,
  value: string,
  fill?: string,
): void {
  const columnNumber = columnAt.get(header);
  if (columnNumber === undefined) {
    return;
  }
  const cell = row.getCell(columnNumber);
  cell.value = value;
  if (fill !== undefined) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  }
}

/** Green for a passing verdict, red for a failing one, neutral for "Not Verified". */
function fillFor(value: string): string {
  if (value === "Invalid" || value === "Not Rural" || value === "Not Eligible" || value === "No") {
    return badFill;
  }
  if (value === "Not Verified") {
    return neutralFill;
  }
  return goodFill;
}

async function loadFirstSheet(filePath: string): Promise<ExcelJS.Worksheet> {
  await requireReadable(filePath);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (error: unknown) {
    /* Readable but not a workbook: the wrong file, or .xls saved under an .xlsx name. */
    throw new Error("That file is not an Excel workbook.", { cause: error });
  }

  const sheet = workbook.worksheets[0];
  if (sheet === undefined) {
    throw new Error("The workbook does not contain any sheets.");
  }
  return sheet;
}

/**
 * Checks the file is there and readable before it is parsed.
 *
 * The three failures call for different actions — find the file, fix its
 * permissions, or export it as .xlsx — so they are reported apart. This is checked
 * here rather than inferred from the parser's failure, which reports a missing file
 * and a corrupt one alike.
 *
 * @throws Error naming the failure in the partner's terms.
 */
async function requireReadable(filePath: string): Promise<void> {
  try {
    await access(filePath, constants.R_OK);
  } catch (error: unknown) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
    throw new Error(
      code === "ENOENT"
        ? "That file could not be found. It may have been moved or renamed."
        : "That file could not be opened. Check the file's permissions and try again.",
      { cause: error },
    );
  }
}

function requireHeaderRow(sheet: ExcelJS.Worksheet): HeaderRow {
  const width = sheet.columnCount;
  const scanned: string[][] = [];
  for (let rowNumber = 1; rowNumber <= Math.min(HEADER_ROW_SCAN_LIMIT, sheet.rowCount); rowNumber += 1) {
    scanned.push(rowCells(sheet.getRow(rowNumber), width));
  }

  const headerRow = findHeaderRow(scanned);
  if (headerRow === null) {
    throw new Error("No column names were found in this sheet.");
  }
  return headerRow;
}

/** One row as positional cell text, so index `i` is always column `i + 1`. */
function rowCells(row: ExcelJS.Row, width: number): string[] {
  const cells: string[] = [];
  for (let column = 1; column <= width; column += 1) {
    cells.push(cellValueToText(row.getCell(column).value));
  }
  return cells;
}

/**
 * How many rows below the names hold a record. Only the named columns count, and
 * only rows filled past [isDataRow]'s threshold, so neither a trailing fill-down
 * nor sheet-wide formatting inflates the total.
 */
function countDataRows(sheet: ExcelJS.Worksheet, headerRowNumber: number, width: number): number {
  let count = 0;
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    /* Only materialised cells are visited, so a formatted-but-empty row is cheap. */
    const filled: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      if (column <= width) {
        filled.push(cellValueToText(cell.value));
      }
    });
    if (isDataRow(filled)) {
      count += 1;
    }
  }
  return count;
}

function cellText(row: ExcelJS.Row, headers: readonly string[], header: string): string {
  /* An unnamed column matches no mapping; indexOf would find the first blank one. */
  if (header.length === 0) {
    return "";
  }
  const columnIndex = headers.indexOf(header);
  if (columnIndex < 0) {
    return "";
  }
  return cellValueToText(row.getCell(columnIndex + 1).value);
}

function cellValueToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim();
  }
  if (typeof value === "object" && "result" in value) {
    return cellValueToText(value.result as ExcelJS.CellValue);
  }
  return "";
}
