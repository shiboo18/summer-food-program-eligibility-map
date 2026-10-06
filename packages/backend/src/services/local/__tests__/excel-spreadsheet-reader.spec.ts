import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, test } from "vitest";

import type { ResultAnnotation } from "../../../types/spreadsheet.js";
import { ExcelSpreadsheetReader } from "../excel-spreadsheet-reader.js";

const directories: string[] = [];

const resultColumns = {
  standardized: "Standardized Address",
  deliverability: "Address Checks",
  location: "Address Match Level",
  rural: "USDA Rural",
  area: "USDA Eligibility",
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

/** A throwaway directory removed after the test that asked for it. */
async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "vibecheck-excel-"));
  directories.push(directory);
  return directory;
}

/** Writes the given rows as the first sheet of a new workbook. */
async function createSheet(rows: readonly unknown[][], name = "addresses.xlsx"): Promise<string> {
  const filePath = join(await createDirectory(), name);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Addresses");
  for (const row of rows) {
    sheet.addRow([...row]);
  }
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

async function createWorkbook(): Promise<string> {
  return createSheet([
    ["Street", "Apt", "City", "State", "Zip"],
    ["123 Main St", "Apt 2", "Austin", "TX", 78701],
    ["456 Oak Ave", "", "Dallas", "TX", "75201"],
    ["", "", "Houston", "TX", "77001"],
  ]);
}

/**
 * Annotates into a copy beside the original, which is the only way the app writes
 * results, and returns the copy's path.
 */
async function annotateToCopy(
  filePath: string,
  annotations: readonly ResultAnnotation[],
  checks: { readonly includeRural: boolean; readonly includeArea: boolean },
): Promise<string> {
  const outputPath = filePath.replace(/\.xlsx$/, "-results.xlsx");
  await new ExcelSpreadsheetReader().annotateResults(filePath, annotations, {
    columns: resultColumns,
    includeRural: checks.includeRural,
    includeArea: checks.includeArea,
    outputPath,
  });
  return outputPath;
}

/** A partner export that opens with a legend row above the column names. */
async function createWorkbookWithLegend(): Promise<string> {
  return createSheet([
    ["", "", "ORANGE = NEED NAMES/AGES OF ALL CHILDREN", "", ""],
    ["Street", "Apt", "City", "State", "Zip"],
    ["123 Main St", "Apt 2", "Austin", "TX", 78701],
    ["456 Oak Ave", "", "Dallas", "TX", "75201"],
  ]);
}

describe("ExcelSpreadsheetReader", () => {
  test("reads headers and data row count", async () => {
    const filePath = await createWorkbook();

    const summary = await new ExcelSpreadsheetReader().readSummary(filePath);

    expect(summary).toMatchObject({
      fileName: "addresses.xlsx",
      headers: ["Street", "Apt", "City", "State", "Zip"],
      rowCount: 3,
    });
  });

  test("builds addresses from the mapping and skips incomplete rows", async () => {
    const filePath = await createWorkbook();

    const result = await new ExcelSpreadsheetReader().readAddressRows(filePath, {
      line1: "Street",
      line2: "Apt",
      city: "City",
      state: "State",
      postalCode: "Zip",
    });

    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        address: {
          line1: "123 Main St",
          line2: "Apt 2",
          city: "Austin",
          state: "TX",
          postalCode: "78701",
          countryCode: "US",
        },
      },
      {
        rowNumber: 3,
        address: {
          line1: "456 Oak Ave",
          city: "Dallas",
          state: "TX",
          postalCode: "75201",
          countryCode: "US",
        },
      },
    ]);
    expect(result.skipped).toEqual([
      { rowNumber: 4, reason: "Missing street, city, state, or ZIP code." },
    ]);
  });

  test("reports the row the column names came from", async () => {
    const filePath = await createWorkbook();

    const summary = await new ExcelSpreadsheetReader().readSummary(filePath);

    expect(summary.headerRowNumber).toBe(1);
  });

  test("takes the column names from below a legend row", async () => {
    const filePath = await createWorkbookWithLegend();

    const summary = await new ExcelSpreadsheetReader().readSummary(filePath);

    expect(summary.headers).toEqual(["Street", "Apt", "City", "State", "Zip"]);
    expect(summary.headerRowNumber).toBe(2);
    expect(summary.rowCount).toBe(2);
  });

  test("reads addresses from below a legend row, keyed by their sheet row", async () => {
    const filePath = await createWorkbookWithLegend();

    const result = await new ExcelSpreadsheetReader().readAddressRows(filePath, {
      line1: "Street",
      city: "City",
      state: "State",
      postalCode: "Zip",
    });

    expect(result.rows).toEqual([
      {
        rowNumber: 3,
        address: { line1: "123 Main St", city: "Austin", state: "TX", postalCode: "78701", countryCode: "US" },
      },
      {
        rowNumber: 4,
        address: { line1: "456 Oak Ave", city: "Dallas", state: "TX", postalCode: "75201", countryCode: "US" },
      },
    ]);
    expect(result.skipped).toEqual([]);
  });

  test("reads the column to the right of an unnamed one, rather than shifting left onto it", async () => {
    const filePath = await createSheet([
      ["Street", "", "City", "State", "Zip"],
      ["123 Main St", "ignored", "Austin", "TX", "78701"],
    ]);

    const summary = await new ExcelSpreadsheetReader().readSummary(filePath);
    const result = await new ExcelSpreadsheetReader().readAddressRows(filePath, {
      line1: "Street",
      city: "City",
      state: "State",
      postalCode: "Zip",
    });

    expect(summary.headers).toEqual(["Street", "", "City", "State", "Zip"]);
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        address: { line1: "123 Main St", city: "Austin", state: "TX", postalCode: "78701", countryCode: "US" },
      },
    ]);
  });

  test("leaves a field empty when the mapping names no column", async () => {
    const filePath = await createSheet([
      ["Street", "", "City", "State", "Zip"],
      ["123 Main St", "ignored", "Austin", "TX", "78701"],
    ]);

    const result = await new ExcelSpreadsheetReader().readAddressRows(filePath, {
      line1: "Street",
      line2: "",
      city: "City",
      state: "State",
      postalCode: "Zip",
    });

    expect(result.rows[0]?.address).toEqual({
      line1: "123 Main St",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      countryCode: "US",
    });
  });

  test("ignores rows holding only a single value filled down past the data", async () => {
    const filePath = await createSheet([
      ["Street", "City", "State", "Zip", "Note"],
      ["123 Main St", "Austin", "TX", "78701", "filled down"],
      ["", "", "", "", "filled down"],
      ["", "", "", "", "filled down"],
    ]);

    const summary = await new ExcelSpreadsheetReader().readSummary(filePath);

    expect(summary.rowCount).toBe(1);
  });

  test("appends result columns to the names row rather than the top row", async () => {
    const filePath = await createWorkbookWithLegend();

    const copyPath = await annotateToCopy(filePath, [{ rowNumber: 3, deliverability: "Valid" }], {
      includeRural: false,
      includeArea: false,
    });

    const summary = await new ExcelSpreadsheetReader().readSummary(copyPath);
    expect(summary.headers).toContain("Address Checks");
    expect(summary.headerRowNumber).toBe(2);
  });

  test("rejects a file that is not an Excel workbook", async () => {
    const filePath = join(await createDirectory(), "notes.xlsx");
    await writeFile(filePath, "just text, not a workbook");

    await expect(new ExcelSpreadsheetReader().readSummary(filePath)).rejects.toThrow(
      "That file is not an Excel workbook.",
    );
  });

  test("reports a file that is no longer there", async () => {
    await expect(new ExcelSpreadsheetReader().readSummary("/tmp/vibecheck-does-not-exist.xlsx")).rejects.toThrow(
      "That file could not be found. It may have been moved or renamed.",
    );
  });

  test("reports a file the app is not allowed to read", async () => {
    const filePath = await createWorkbook();
    await chmod(filePath, 0o000);

    await expect(new ExcelSpreadsheetReader().readSummary(filePath)).rejects.toThrow(
      "That file could not be opened. Check the file's permissions and try again.",
    );

    await chmod(filePath, 0o600);
  });

  test("rejects a sheet with no column names anywhere near the top", async () => {
    const filePath = await createSheet([[""], [""], [""]]);

    await expect(new ExcelSpreadsheetReader().readSummary(filePath)).rejects.toThrow(
      "No column names were found in this sheet.",
    );
  });

  test("annotateResults appends the standardized column before the checks and preserves original data", async () => {
    const filePath = await createWorkbook();

    const copyPath = await annotateToCopy(
      filePath,
      [
        {
          rowNumber: 2,
          deliverability: "Valid and corrected",
          standardizedAddress: "123 Main St, Austin, TX 78701-1234",
          location: "Exact address",
          rural: "Rural",
          area: "In Area — Eligible",
        },
        { rowNumber: 3, deliverability: "Invalid", location: "Not located", rural: "Not Verified", area: "Not Verified" },
      ],
      { includeRural: true, includeArea: true },
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(copyPath);
    const sheet = workbook.worksheets[0]!;
    /* `values` is 1-based, so index 6 onward is what was appended past the five originals. */
    const header = sheet.getRow(1).values as unknown[];
    expect(header.slice(6)).toEqual([
      "Standardized Address",
      "Address Checks",
      "Address Match Level",
      "USDA Rural",
      "USDA Eligibility",
    ]);
    // Original columns untouched.
    expect(sheet.getRow(2).getCell(1).value).toBe("123 Main St");
    // Standardized address written only for the corrected row, in the column before the status.
    expect(sheet.getRow(2).getCell(6).value).toBe("123 Main St, Austin, TX 78701-1234");
    expect(sheet.getRow(3).getCell(6).value ?? "").toBe("");
    // Corrected addresses are color-coded, and the column is widened so it reads without resizing.
    expect((sheet.getRow(2).getCell(6).fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFFCE9C8");
    expect(sheet.getColumn(6).width).toBe(36);
    // Status cell written and color-coded.
    const statusCell = sheet.getRow(2).getCell(7);
    expect(statusCell.value).toBe("Valid and corrected");
    expect((statusCell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFDDF3DD");
    // Location column, color-coded by trust: green exact address, grey not located.
    const rooftopCell = sheet.getRow(2).getCell(8);
    expect(rooftopCell.value).toBe("Exact address");
    expect((rooftopCell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFDDF3DD");
    const notLocatedCell = sheet.getRow(3).getCell(8);
    expect(notLocatedCell.value).toBe("Not located");
    expect((notLocatedCell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFF2F2F2");
    expect(sheet.getRow(2).getCell(9).value).toBe("Rural");
    expect(sheet.getRow(2).getCell(10).value).toBe("In Area — Eligible");
    const invalidCell = sheet.getRow(3).getCell(7);
    expect(invalidCell.value).toBe("Invalid");
    expect((invalidCell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFF6D6D6");
    const notVerifiedCell = sheet.getRow(3).getCell(9);
    expect(notVerifiedCell.value).toBe("Not Verified");
    expect((notVerifiedCell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FFF2F2F2");
  });

  test("annotateResults omits rural/area columns when those checks did not run", async () => {
    const filePath = await createWorkbook();

    const copyPath = await annotateToCopy(filePath, [{ rowNumber: 2, deliverability: "Valid" }], {
      includeRural: false,
      includeArea: false,
    });

    const summary = await new ExcelSpreadsheetReader().readSummary(copyPath);
    expect(summary.headers).toEqual([
      "Street",
      "Apt",
      "City",
      "State",
      "Zip",
      "Standardized Address",
      "Address Checks",
      "Address Match Level",
    ]);
  });

  test("annotateResults leaves the original workbook without result columns", async () => {
    const filePath = await createWorkbook();
    const reader = new ExcelSpreadsheetReader();

    const copyPath = await annotateToCopy(filePath, [{ rowNumber: 2, deliverability: "Valid" }], {
      includeRural: false,
      includeArea: false,
    });

    const original = await reader.readSummary(filePath);
    expect(original.headers).not.toContain("Address Checks");
    const copy = await reader.readSummary(copyPath);
    expect(copy.headers).toContain("Address Checks");
  });
});
