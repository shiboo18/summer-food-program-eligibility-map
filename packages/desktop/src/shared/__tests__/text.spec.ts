import { describe, expect, test } from "vitest";

import { splitAroundFileName } from "../text.js";

describe("splitAroundFileName", () => {
  const fileName = "Union County PII removed.xlsx";

  test("splits a sentence that ends with the file name and its full stop", () => {
    expect(splitAroundFileName(`Match each address field to a column in ${fileName}.`, fileName)).toEqual({
      before: "Match each address field to a column in ",
      after: ".",
    });
  });

  test("splits a sentence that opens with the file name", () => {
    expect(splitAroundFileName(`${fileName} is loaded. Upload another to start over.`, fileName)).toEqual({
      before: "",
      after: " is loaded. Upload another to start over.",
    });
  });

  test("splits on the first mention only, leaving a second in the remainder", () => {
    expect(splitAroundFileName(`${fileName} and ${fileName}`, fileName)).toEqual({
      before: "",
      after: ` and ${fileName}`,
    });
  });

  test("returns null for a sentence that does not mention the file", () => {
    expect(splitAroundFileName("Upload a file to map its columns.", fileName)).toBe(null);
  });

  test("returns null when the mention differs in case, since the name is shown verbatim", () => {
    expect(splitAroundFileName("A column in union county pii removed.xlsx.", fileName)).toBe(null);
  });

  test("returns null for an empty file name, which every sentence would match", () => {
    expect(splitAroundFileName("Upload a file to map its columns.", "")).toBe(null);
  });
});
