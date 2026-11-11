import { describe, expect, test } from "vitest";

import { resultsLocation } from "../steps/checks-step.js";
import { workflowSteps } from "../steps/index.js";
import { headerRowHint } from "../steps/map-columns-step.js";
import { uploadStep } from "../steps/upload-step.js";
import type { WorkflowContext } from "../workflow-step.js";

const empty: WorkflowContext = { fileName: null, rowCount: 0, columnCount: 0, report: null };
const uploaded: WorkflowContext = {
  fileName: "addresses.xlsx",
  rowCount: 12,
  columnCount: 5,
  report: null,
};
const validated: WorkflowContext = {
  ...uploaded,
  report: {
    fileName: "addresses.xlsx",
    total: 12,
    verified: 10,
    corrected: 1,
    failures: [],
  },
};

describe("workflowSteps", () => {
  test("runs upload, mapping, checks, then results with unique ids and sections", () => {
    expect(workflowSteps.map((step) => step.id)).toEqual(["upload", "map-columns", "checks", "results"]);
    expect(new Set(workflowSteps.map((step) => step.sectionId)).size).toBe(workflowSteps.length);
  });

  test("grays out later steps until their prerequisites are met", () => {
    expect(workflowSteps.map((step) => step.isAvailable(empty))).toEqual([true, false, false, false]);
    expect(workflowSteps.map((step) => step.isAvailable(uploaded))).toEqual([true, true, true, false]);
    expect(workflowSteps.map((step) => step.isAvailable(validated))).toEqual([true, true, true, true]);
  });

  test("each step describes itself using the current context", () => {
    const [upload, mapColumns, checks, results] = workflowSteps;
    expect(upload?.description(uploaded)).toContain("addresses.xlsx");
    expect(mapColumns?.description(uploaded)).toContain("addresses.xlsx");
    expect(checks?.description(uploaded)).toContain("The address check always runs");
    expect(results?.title(validated)).toBe("All addresses deliverable");
    expect(results?.description(validated)).toContain("export an annotated copy");
  });

  /* Counts and per-row detail belong to the page itself, not the header, so the
     header stays a short title plus a one-line sub-header. */
  test("keeps every header short and every sub-header to one line", () => {
    for (const step of workflowSteps) {
      for (const context of [empty, uploaded, validated]) {
        expect(step.title(context).length).toBeLessThanOrEqual(28);
        expect(step.description(context).length).toBeLessThanOrEqual(100);
      }
    }
  });

  test("provides a home-page summary for every step", () => {
    expect(workflowSteps).toHaveLength(4);
    for (const step of workflowSteps) {
      expect(step.summary.trim()).not.toBe("");
      expect(step.label.trim()).not.toBe("");
    }
  });
});

describe("resultsLocation", () => {
  test.each([
    {
      case: "the three address columns",
      headers: ["Standardized Address", "Address Checks", "Address Match Level"],
      text: "Results go in a copy of your file, as new columns after your last column: Standardized Address, Address Checks, and Address Match Level. Your original file isn't changed.",
    },
    {
      case: "all five columns",
      headers: ["Standardized Address", "Address Checks", "Address Match Level", "USDA Rural", "USDA Eligibility"],
      text: "Results go in a copy of your file, as new columns after your last column: Standardized Address, Address Checks, Address Match Level, USDA Rural, and USDA Eligibility. Your original file isn't changed.",
    },
    {
      case: "four columns",
      headers: ["Standardized Address", "Address Checks", "Address Match Level", "USDA Eligibility"],
      text: "Results go in a copy of your file, as new columns after your last column: Standardized Address, Address Checks, Address Match Level, and USDA Eligibility. Your original file isn't changed.",
    },
  ])("when appending $case, names them in order", ({ headers, text }) => {
    const sentence = resultsLocation(headers);

    expect(sentence).toBe(text);
  });
});

describe("headerRowHint", () => {
  test.each([
    { row: 1, text: "These are the headers vibeCheck found in row 1. Addresses are read from row 2 down." },
    { row: 3, text: "These are the headers vibeCheck found in row 3. Addresses are read from row 4 down." },
    { row: 12, text: "These are the headers vibeCheck found in row 12. Addresses are read from row 13 down." },
  ])("when the names are in row $row, says addresses start on the next row", ({ row, text }) => {
    const hint = headerRowHint(row);

    expect(hint).toBe(text);
  });
});

/* vibeCheck finds the header row itself, so the upload copy must not promise it is row 1. */
describe("uploadStep copy", () => {
  test("when no file is loaded, asks for column names above the addresses, not in the first row", () => {
    const description = uploadStep.description(empty);

    expect(description).toBe("Pick an Excel workbook with a row of column names above the addresses.");
  });

  test("the home-page summary asks for column names above the addresses", () => {
    expect(uploadStep.summary).toBe("Choose an Excel workbook with a row of column names above the addresses.");
  });
});
