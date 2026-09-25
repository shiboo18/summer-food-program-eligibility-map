import { describe, expect, test } from "vitest";

import { findHeaderRow, isDataRow } from "../sheet-shape.js";

describe("findHeaderRow", () => {
  test("takes the top row when the names are there", () => {
    const rows = [
      ["Street", "City", "State", "Zip"],
      ["123 Main St", "Austin", "TX", "78701"],
    ];

    expect(findHeaderRow(rows)).toEqual({
      rowNumber: 1,
      headers: ["Street", "City", "State", "Zip"],
    });
  });

  test("skips a legend row above the names", () => {
    const rows = [
      ["", "", "ORANGE = NEED NAMES/AGES OF ALL CHILDREN", ""],
      ["Street", "City", "State", "Zip"],
      ["123 Main St", "Austin", "TX", "78701"],
    ];

    expect(findHeaderRow(rows)).toEqual({
      rowNumber: 2,
      headers: ["Street", "City", "State", "Zip"],
    });
  });

  test("skips a multi-row title block above the names", () => {
    const rows = [
      ["Union County enrollment", "", "", ""],
      ["", "", "Exported 2026-04-29", ""],
      ["Street", "City", "State", "Zip"],
      ["123 Main St", "Austin", "TX", "78701"],
    ];

    expect(findHeaderRow(rows)?.rowNumber).toBe(3);
  });

  test("keeps an unnamed column inside the row so later columns keep their position", () => {
    const rows = [
      ["Street", "", "City", "State", "Zip"],
      ["123 Main St", "", "Austin", "TX", "78701"],
    ];

    expect(findHeaderRow(rows)?.headers).toEqual(["Street", "", "City", "State", "Zip"]);
  });

  test("drops the blanks after the last named column", () => {
    const rows = [["Street", "City", "", ""]];

    expect(findHeaderRow(rows)?.headers).toEqual(["Street", "City"]);
  });

  test("trims the names so a padded cell still matches a mapping", () => {
    const rows = [["  Street  ", " City "]];

    expect(findHeaderRow(rows)?.headers).toEqual(["Street", "City"]);
  });

  test("takes the only row of a sheet that has nothing but names", () => {
    expect(findHeaderRow([["Street", "City", "State", "Zip"]])).toEqual({
      rowNumber: 1,
      headers: ["Street", "City", "State", "Zip"],
    });
  });

  test("returns null for a sheet with no rows", () => {
    expect(findHeaderRow([])).toBe(null);
  });

  test("returns null when every scanned row is blank", () => {
    expect(findHeaderRow([["", ""], ["", ""]])).toBe(null);
  });

  test("ignores a column filled down past the names when measuring how full a row is", () => {
    /* Mirrors the stray fill-down that makes every row of a sheet look occupied. */
    const rows = [
      ["", "", "", "REQUESTED STREET ADDRESS"],
      ["Street", "City", "State", "REQUESTED STREET ADDRESS"],
      ["123 Main St", "Austin", "TX", "REQUESTED STREET ADDRESS"],
      ["", "", "", "REQUESTED STREET ADDRESS"],
    ];

    expect(findHeaderRow(rows)).toEqual({
      rowNumber: 2,
      headers: ["Street", "City", "State", "REQUESTED STREET ADDRESS"],
    });
  });
});

describe("isDataRow", () => {
  test("counts a row with several filled cells", () => {
    expect(isDataRow(["123 Main St", "Austin", "TX", "78701"])).toBe(true);
  });

  test("counts a row filled in exactly the minimum number of cells", () => {
    expect(isDataRow(["123 Main St", "", "", "78701"])).toBe(true);
  });

  test("rejects a row holding only one filled-down cell", () => {
    expect(isDataRow(["", "", "", "REQUESTED STREET ADDRESS"])).toBe(false);
  });

  test("rejects a blank row", () => {
    expect(isDataRow(["", "", ""])).toBe(false);
  });

  test("rejects a row with no cells at all", () => {
    expect(isDataRow([])).toBe(false);
  });
});
