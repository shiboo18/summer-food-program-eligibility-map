import { describe, expect, test } from "vitest";

import type { RowVerification } from "../../types/address.js";
import type { EligibilityRowResult } from "../../types/eligibility.js";
import { toResultAnnotation } from "../result-annotation.js";

const bothChecks = { rural: true, area: true };
const verified: RowVerification = { status: "verified" };

function row(overrides: Partial<EligibilityRowResult>): EligibilityRowResult {
  return {
    rowNumber: 2,
    precision: "rooftop",
    confidence: "high",
    needsVerification: false,
    messages: [],
    ...overrides,
  };
}

describe("toResultAnnotation", () => {
  test("maps a verified rooftop row's verdicts and location", () => {
    const annotation = toResultAnnotation(2, verified, bothChecks, row({
      rural: { designation: "rural", matchedCriteria: ["County not part of an MSA"] },
      area: { eligibility: "eligible" },
    }));

    expect(annotation).toEqual({
      rowNumber: 2,
      deliverability: "Valid",
      location: "Exact address",
      rural: "Rural",
      area: "In Area — Eligible",
    });
  });

  test("a corrected address reads Valid and corrected and carries the standardized address", () => {
    const annotation = toResultAnnotation(
      3,
      { status: "corrected", standardizedAddress: "1 Main St, Austin, TX 78701" },
      bothChecks,
      row({ area: { eligibility: "averaged-eligible" }, rural: { designation: "rural", matchedCriteria: [] } }),
    );

    expect(annotation.deliverability).toBe("Valid and corrected");
    expect(annotation.standardizedAddress).toBe("1 Main St, Austin, TX 78701");
    expect(annotation.area).toBe("In Area — Averaged");
    expect(annotation.rural).toBe("Rural");
  });

  test("maps a not-rural, not-eligible row", () => {
    const annotation = toResultAnnotation(4, verified, bothChecks, row({
      rural: { designation: "not-rural", matchedCriteria: [] },
      area: { eligibility: "not-eligible" },
    }));

    expect(annotation.rural).toBe("Not Rural");
    expect(annotation.area).toBe("Not Eligible");
  });

  test("hedges the verdicts when the location is approximate", () => {
    const annotation = toResultAnnotation(6, verified, bothChecks, row({
      precision: "postal",
      rural: { designation: "rural", matchedCriteria: [] },
      area: { eligibility: "eligible" },
    }));

    expect(annotation.location).toBe("ZIP area");
    expect(annotation.rural).toBe("Rural (approximate location)");
    expect(annotation.area).toBe("In Area — Eligible (approximate location)");
  });

  test("does not hedge a street-level location", () => {
    const annotation = toResultAnnotation(6, verified, bothChecks, row({
      precision: "street",
      rural: { designation: "not-rural", matchedCriteria: [] },
      area: { eligibility: "not-eligible" },
    }));

    expect(annotation.location).toBe("Street level");
    expect(annotation.rural).toBe("Not Rural");
    expect(annotation.area).toBe("Not Eligible");
  });

  test("names the location precision class", () => {
    const cases = [
      ["rooftop", "Exact address"],
      ["street", "Street level"],
      ["postal", "ZIP area"],
      ["locality", "Town area"],
      ["unknown", "Not located"],
    ] as const;

    for (const [precision, label] of cases) {
      expect(toResultAnnotation(1, verified, bothChecks, row({ precision })).location).toBe(label);
    }
  });

  test("an unverified row reads Invalid, Not located, and Not Verified", () => {
    const annotation = toResultAnnotation(5, { status: "unverified" }, bothChecks, undefined);

    expect(annotation).toEqual({
      rowNumber: 5,
      deliverability: "Invalid",
      location: "Not located",
      rural: "Not Verified",
      area: "Not Verified",
    });
  });

  test("a verified row whose check produced no result reads Not Verified", () => {
    const annotation = toResultAnnotation(10, verified, bothChecks, row({ area: { eligibility: "eligible" } }));

    expect(annotation.rural).toBe("Not Verified");
    expect(annotation.area).toBe("In Area — Eligible");
  });

  test("omits columns for checks that were not selected", () => {
    const annotation = toResultAnnotation(7, verified, { rural: false, area: true }, row({
      area: { eligibility: "eligible" },
    }));

    expect(annotation.rural).toBeUndefined();
    expect(annotation.area).toBe("In Area — Eligible");
  });

  test("unknown area (no polygon) reads Not Verified", () => {
    const annotation = toResultAnnotation(8, verified, bothChecks, row({ area: { eligibility: "unknown" } }));

    expect(annotation.area).toBe("Not Verified");
  });
});
