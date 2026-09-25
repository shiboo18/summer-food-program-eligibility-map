import { describe, expect, test } from "vitest";

import { followingCells, parseTypedCells, type TypedCell } from "../cell-mapping.js";

function cell(field: TypedCell["field"], value: string, required = false): TypedCell {
  return { field, label: field, required, value };
}

describe("parseTypedCells", () => {
  test("keeps typed cells and normalizes them to upper case", () => {
    const result = parseTypedCells([cell("line1", " a1 "), cell("city", "c1")]);

    expect(result).toEqual({ ok: true, cells: { line1: "A1", city: "C1" } });
  });

  test("skips blank optional fields", () => {
    const result = parseTypedCells([cell("line1", "A1"), cell("line2", "")]);

    expect(result).toEqual({ ok: true, cells: { line1: "A1" } });
  });

  test("reports a blank required field", () => {
    const result = parseTypedCells([cell("city", "", true)]);

    expect(result).toEqual({ ok: false, message: "city needs a header cell such as A1." });
  });

  test("reports a value that is not a cell", () => {
    const result = parseTypedCells([cell("state", "State")]);

    expect(result).toEqual({ ok: false, message: "state needs a header cell such as A1." });
  });

  test("reports the first problem only", () => {
    const result = parseTypedCells([cell("line1", "nope"), cell("city", "also-bad")]);

    expect(result).toEqual({ ok: false, message: "line1 needs a header cell such as A1." });
  });
});

describe("followingCells", () => {
  test("returns the next columns in the same row", () => {
    expect(followingCells("A1", 4)).toEqual(["B1", "C1", "D1", "E1"]);
  });

  test("keeps the lead row", () => {
    expect(followingCells("C3", 2)).toEqual(["D3", "E3"]);
  });

  test("rolls over past the last single letter", () => {
    expect(followingCells("Y1", 3)).toEqual(["Z1", "AA1", "AB1"]);
  });

  test("returns nothing for a lead that is not a cell", () => {
    expect(followingCells("City", 3)).toEqual([]);
  });
});
