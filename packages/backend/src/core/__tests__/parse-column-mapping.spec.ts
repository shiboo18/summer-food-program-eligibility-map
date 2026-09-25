import { describe, expect, test } from "vitest";

import { parseColumnMapping } from "../parse-column-mapping.js";

const headers = ["Street", "Apt", "City", "State", "Zip"];

describe("parseColumnMapping", () => {
  test("accepts a mapping that uses real headers", () => {
    expect(
      parseColumnMapping(
        { line1: "Street", line2: "Apt", city: "City", state: "State", postalCode: "Zip" },
        headers,
      ),
    ).toEqual({ line1: "Street", line2: "Apt", city: "City", state: "State", postalCode: "Zip" });
  });

  test("treats the optional second line as absent when blank", () => {
    const mapping = parseColumnMapping(
      { line1: "Street", line2: "", city: "City", state: "State", postalCode: "Zip" },
      headers,
    );
    expect(mapping.line2).toBeUndefined();
  });

  test("rejects missing fields, unknown headers, and malformed input", () => {
    expect(() => parseColumnMapping(null, headers)).toThrow("Column mapping is invalid.");
    expect(() => parseColumnMapping({ line1: "Street", city: "City", state: "State" }, headers)).toThrow(
      "Choose a column for ZIP code.",
    );
    expect(() =>
      parseColumnMapping(
        { line1: "Nope", city: "City", state: "State", postalCode: "Zip" },
        headers,
      ),
    ).toThrow('The column "Nope" is not in the uploaded file.');
  });
});
