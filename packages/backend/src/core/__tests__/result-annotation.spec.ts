import { describe, expect, test } from "vitest";

import type { RowVerification } from "../../types/address.js";
import type { EligibilityChecks, EligibilityRowResult } from "../../types/eligibility.js";
import { toResultAnnotation, toResultAnnotations } from "../result-annotation.js";

const bothChecks: EligibilityChecks = { rural: true, area: true };
const verified: RowVerification = { status: "verified" };

function row(overrides: Partial<EligibilityRowResult>): EligibilityRowResult {
  return { rowNumber: 2, confidence: "high", needsVerification: false, messages: [], ...overrides };
}

function eligibility(result: EligibilityRowResult | undefined, checks: EligibilityChecks = bothChecks) {
  return { checks, rows: new Map(result === undefined ? [] : [[result.rowNumber, result]]) };
}

describe("toResultAnnotation", () => {
  test("keeps the validation-only annotation when no USDA check ran", () => {
    expect(toResultAnnotation(2, verified)).toEqual({ rowNumber: 2, deliverability: "Valid" });
    expect(toResultAnnotation(2, verified, eligibility(row({}), { rural: false, area: false }))).toEqual({
      rowNumber: 2,
      deliverability: "Valid",
    });
  });

  test("keeps the standardized address only for a corrected row", () => {
    expect(toResultAnnotation(2, { status: "corrected", standardizedAddress: "1 MAIN ST" })).toEqual({
      rowNumber: 2,
      deliverability: "Valid and corrected",
      standardizedAddress: "1 MAIN ST",
    });
  });

  test("maps a deliverable, confident, eligible and rural row to Ready=Yes", () => {
    const annotation = toResultAnnotation(
      2,
      verified,
      eligibility(row({ rural: { designation: "rural", matchedCriteria: [] }, area: { eligibility: "eligible" } })),
    );

    expect(annotation).toEqual({
      rowNumber: 2,
      deliverability: "Valid",
      rural: "Rural",
      area: "In Area — Eligible",
      ready: "Yes",
    });
  });

  test("maps averaged-eligible to the averaged label and still Ready=Yes", () => {
    const annotation = toResultAnnotation(
      2,
      verified,
      eligibility(
        row({ rural: { designation: "rural", matchedCriteria: [] }, area: { eligibility: "averaged-eligible" } }),
      ),
    );

    expect(annotation.area).toBe("In Area — Averaged");
    expect(annotation.ready).toBe("Yes");
  });

  test("is not ready when area-eligible but not rural", () => {
    const annotation = toResultAnnotation(
      2,
      verified,
      eligibility(row({ rural: { designation: "not-rural", matchedCriteria: [] }, area: { eligibility: "eligible" } })),
    );

    expect(annotation.rural).toBe("Not Rural");
    expect(annotation.ready).toBe("No");
  });

  test("marks an invalid address's USDA columns Not Verified and Ready=No", () => {
    expect(toResultAnnotation(5, { status: "unverified" }, eligibility(undefined))).toEqual({
      rowNumber: 5,
      deliverability: "Invalid",
      rural: "Not Verified",
      area: "Not Verified",
      ready: "No",
    });
  });

  test("does not trust an approximate location", () => {
    const annotation = toResultAnnotation(
      2,
      verified,
      eligibility(
        row({
          confidence: "low",
          needsVerification: true,
          rural: { designation: "rural", matchedCriteria: [] },
          area: { eligibility: "eligible" },
        }),
      ),
    );

    expect(annotation.rural).toBe("Not Verified");
    expect(annotation.area).toBe("Not Verified");
    expect(annotation.ready).toBe("No");
  });

  test("omits the column for a check that was not selected", () => {
    const annotation = toResultAnnotation(
      2,
      verified,
      eligibility(row({ area: { eligibility: "eligible" } }), { rural: false, area: true }),
    );

    expect(annotation.rural).toBeUndefined();
    expect(annotation.area).toBe("In Area — Eligible");
  });

  test("reads an unknown area as Not Verified", () => {
    const annotation = toResultAnnotation(2, verified, eligibility(row({ area: { eligibility: "unknown" } })));

    expect(annotation.area).toBe("Not Verified");
    expect(annotation.ready).toBe("No");
  });
});

describe("toResultAnnotations", () => {
  test("returns one annotation per row, in row order", () => {
    const verifications = new Map<number, RowVerification>([
      [4, { status: "unverified" }],
      [2, verified],
    ]);

    expect(toResultAnnotations(verifications).map((annotation) => annotation.rowNumber)).toEqual([2, 4]);
  });
});
