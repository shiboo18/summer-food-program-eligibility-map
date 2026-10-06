import { describe, expect, test } from "vitest";

import { workflowSteps } from "../steps/index.js";
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
    expect(checks?.description(uploaded)).toContain("Address validation always runs");
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
