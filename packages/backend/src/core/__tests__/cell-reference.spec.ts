import { describe, expect, test } from "vitest";

import {
  cellAtColumn,
  columnNumberFromCell,
  headerAtCell,
  isCellReference,
  rowNumberFromCell,
} from "../cell-reference.js";

const headers = ["Address Line#1", "Line#2", "City", "State", "ZipCode"];

describe("isCellReference", () => {
  test("accepts spreadsheet header cells", () => {
    expect(isCellReference("A1")).toBe(true);
    expect(isCellReference("c1")).toBe(true);
    expect(isCellReference(" AB2 ")).toBe(true);
  });

  test("rejects anything that is not a cell", () => {
    expect(isCellReference("")).toBe(false);
    expect(isCellReference("City")).toBe(false);
    expect(isCellReference("1A")).toBe(false);
    expect(isCellReference("A")).toBe(false);
    expect(isCellReference("A1:B2")).toBe(false);
  });
});

describe("columnNumberFromCell", () => {
  test("converts column letters to a 1-based number", () => {
    expect(columnNumberFromCell("A1")).toBe(1);
    expect(columnNumberFromCell("E1")).toBe(5);
    expect(columnNumberFromCell("Z1")).toBe(26);
    expect(columnNumberFromCell("AA1")).toBe(27);
  });

  test("ignores case and surrounding spaces", () => {
    expect(columnNumberFromCell(" c1 ")).toBe(3);
  });

  test("returns undefined for an invalid reference", () => {
    expect(columnNumberFromCell("City")).toBeUndefined();
  });
});

describe("rowNumberFromCell", () => {
  test("reads the row from a cell", () => {
    expect(rowNumberFromCell("A1")).toBe(1);
    expect(rowNumberFromCell("C12")).toBe(12);
  });

  test("returns undefined for an invalid reference", () => {
    expect(rowNumberFromCell("City")).toBeUndefined();
  });
});

describe("cellAtColumn", () => {
  test("builds the cell for a column and row", () => {
    expect(cellAtColumn(1, 1)).toBe("A1");
    expect(cellAtColumn(2, 1)).toBe("B1");
    expect(cellAtColumn(26, 1)).toBe("Z1");
    expect(cellAtColumn(27, 1)).toBe("AA1");
    expect(cellAtColumn(3, 4)).toBe("C4");
  });

  test("round-trips with columnNumberFromCell", () => {
    for (const column of [1, 5, 26, 27, 52, 53, 703]) {
      expect(columnNumberFromCell(cellAtColumn(column, 1))).toBe(column);
    }
  });
});

describe("headerAtCell", () => {  test("finds the column name at a header cell", () => {
    expect(headerAtCell("A1", headers)).toBe("Address Line#1");
    expect(headerAtCell("C1", headers)).toBe("City");
    expect(headerAtCell("E1", headers)).toBe("ZipCode");
  });

  test("returns undefined when the sheet is narrower than the cell", () => {
    expect(headerAtCell("Z1", headers)).toBeUndefined();
  });

  test("returns undefined for an invalid reference", () => {
    expect(headerAtCell("nope", headers)).toBeUndefined();
  });

  test("returns undefined for a column the sheet leaves unnamed", () => {
    expect(headerAtCell("B1", ["Street", "", "City"])).toBeUndefined();
  });

  test("reads the column letters only, so the row typed makes no difference", () => {
    expect(headerAtCell("C2", headers)).toBe("City");
    expect(headerAtCell("C7", headers)).toBe("City");
  });
});
