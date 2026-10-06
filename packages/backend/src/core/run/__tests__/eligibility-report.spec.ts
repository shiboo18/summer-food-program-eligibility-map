import { describe, expect, test } from "vitest";

import type { Address } from "../../../types/address.js";
import type {
  AreaEligibilityResult,
  CheckOutcome,
  LocatedRow,
  LocationPrecision,
  RuralResult,
} from "../../../types/eligibility.js";
import { buildEligibilityReport, type EligibilityReportInput } from "../eligibility-report.js";

const address: Address = { line1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", countryCode: "US" };

function located(rowNumber: number, precision: LocationPrecision = "rooftop", score = 100): LocatedRow {
  return { rowNumber, address, geocode: { point: { lat: 1, lng: 2 }, score, precision, matchedAddress: "1 MAIN ST" } };
}

const rural: RuralResult = { designation: "rural", matchedCriteria: ["Census tract rural designation"] };
const notRural: RuralResult = { designation: "not-rural", matchedCriteria: [] };
const eligible: AreaEligibilityResult = { eligibility: "eligible" };
const averaged: AreaEligibilityResult = { eligibility: "averaged-eligible" };

function ok<Value>(value: Value): CheckOutcome<Value> {
  return { ok: true, value };
}

function input(overrides: Partial<EligibilityReportInput> = {}): EligibilityReportInput {
  return {
    fileName: "file.xlsx",
    located: [],
    unlocated: [],
    unverified: [],
    zone: new Map(),
    benefit: new Map(),
    skipped: [],
    checks: { rural: true, area: true },
    ...overrides,
  };
}

describe("buildEligibilityReport", () => {
  test("reports a high-confidence row with both results and no messages", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(7)],
        zone: new Map([[7, ok(rural)]]),
        benefit: new Map([[7, ok(eligible)]]),
      }),
    );

    expect(report.fileName).toBe("file.xlsx");
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toEqual({
      rowNumber: 7,
      matchedAddress: "1 MAIN ST",
      score: 100,
      precision: "rooftop",
      confidence: "high",
      needsVerification: false,
      rural,
      area: eligible,
      messages: [],
    });
  });

  test("leaves an unselected check off the row without complaint", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(1)],
        zone: new Map([[1, ok(rural)]]),
        checks: { rural: true, area: false },
      }),
    );

    expect(report.rows[0]?.rural).toEqual(rural);
    expect(report.rows[0]?.area).toBeUndefined();
    expect(report.rows[0]?.messages).toEqual([]);
    expect(report.rows[0]?.needsVerification).toBe(false);
  });

  /* Trust follows the precision class, not the score: a ZIP centroid can score
     100 while sitting in the wrong block group. */
  test("trusts a street-level location", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(1, "street", 97)],
        zone: new Map([[1, ok(rural)]]),
        benefit: new Map([[1, ok(eligible)]]),
      }),
    );

    expect(report.rows[0]?.confidence).toBe("high");
    expect(report.rows[0]?.needsVerification).toBe(false);
    expect(report.rows[0]?.messages).toEqual([]);
    expect(report.needingVerification).toBe(0);
  });

  test("flags a postal-precision location however well it scored", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(1, "postal", 100)],
        zone: new Map([[1, ok(rural)]]),
        benefit: new Map([[1, ok(eligible)]]),
      }),
    );

    expect(report.rows[0]?.confidence).toBe("low");
    expect(report.rows[0]?.needsVerification).toBe(true);
    expect(report.rows[0]?.messages[0]).toContain("approximate");
  });

  test("flags a tightly-placed location that matched the address poorly", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(1, "rooftop", 40)],
        zone: new Map([[1, ok(rural)]]),
        benefit: new Map([[1, ok(eligible)]]),
      }),
    );

    expect(report.rows[0]?.confidence).toBe("low");
    expect(report.rows[0]?.needsVerification).toBe(true);
  });

  test("flags a low-confidence location for verification but keeps its results", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(1, "postal")],
        zone: new Map([[1, ok(rural)]]),
        benefit: new Map([[1, ok(eligible)]]),
      }),
    );

    const result = report.rows[0];
    expect(result?.confidence).toBe("low");
    expect(result?.needsVerification).toBe(true);
    expect(result?.messages[0]).toContain("approximate");
    expect(result?.area).toEqual(eligible);
  });

  /* A failed check keeps the location the row did resolve, rather than discarding
     it, and says which check could not be made. */
  test("keeps the location and names the check when an outcome failed", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(1)],
        zone: new Map<number, CheckOutcome<RuralResult>>([[1, { ok: false, reason: "USDA rural map unavailable" }]]),
        benefit: new Map([[1, ok(eligible)]]),
      }),
    );

    const result = report.rows[0];
    expect(result?.confidence).toBe("high");
    expect(result?.matchedAddress).toBe("1 MAIN ST");
    expect(result?.rural).toBeUndefined();
    expect(result?.area).toEqual(eligible);
    expect(result?.needsVerification).toBe(true);
    expect(result?.messages).toEqual([
      "USDA rural designation could not be checked: USDA rural map unavailable",
    ]);
  });

  test("notes a selected check that produced no outcome at all", () => {
    const report = buildEligibilityReport(input({ located: [located(1)], checks: { rural: true, area: false } }));

    expect(report.rows[0]?.messages).toEqual(["USDA rural designation was not checked."]);
    expect(report.rows[0]?.needsVerification).toBe(true);
  });

  test("reports a row that could not be located", () => {
    const report = buildEligibilityReport(input({ unlocated: [{ rowNumber: 3 }] }));

    expect(report.rows[0]).toMatchObject({ rowNumber: 3, confidence: "none", needsVerification: true });
    expect(report.rows[0]?.messages[0]).toContain("could not be located");
  });

  test("adds the reason when locating failed rather than simply not matching", () => {
    const report = buildEligibilityReport(
      input({ unlocated: [{ rowNumber: 3, reason: "The address could not be located." }] }),
    );

    expect(report.rows[0]?.messages[0]).toContain("The address could not be located.");
  });

  test("reports an unverified address as not checked and needing verification", () => {
    const report = buildEligibilityReport(input({ unverified: [5] }));

    const result = report.rows[0];
    expect(result).toMatchObject({ rowNumber: 5, confidence: "none", needsVerification: true });
    expect(result?.rural).toBeUndefined();
    expect(result?.area).toBeUndefined();
    expect(result?.messages).toEqual([
      "This address could not be verified, so USDA eligibility was not checked.",
    ]);
  });

  test("counts an unverified row in the total but never as located, rural, or eligible", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(1)],
        unverified: [2],
        zone: new Map([[1, ok(rural)]]),
        benefit: new Map([[1, ok(eligible)]]),
      }),
    );

    expect(report.total).toBe(2);
    expect(report.located).toBe(1);
    expect(report.needingVerification).toBe(1);
    expect(report.ruralCount).toBe(1);
    expect(report.areaEligibleCount).toBe(1);
    expect(report.rows.map((result) => result.rowNumber)).toEqual([1, 2]);
  });

  test("carries a skipped row through with the reader's reason", () => {
    const report = buildEligibilityReport(
      input({ located: [located(3)], skipped: [{ rowNumber: 2, reason: "Missing street address." }] }),
    );

    expect(report.total).toBe(2);
    expect(report.located).toBe(1);
    expect(report.rows.map((result) => result.rowNumber)).toEqual([2, 3]);
    expect(report.rows[0]).toMatchObject({ rowNumber: 2, confidence: "none", needsVerification: true });
    expect(report.rows[0]?.messages).toEqual(["Missing street address."]);
  });

  test("orders every row by its number whichever pass produced it", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(5), located(2)],
        unlocated: [{ rowNumber: 4 }],
        skipped: [{ rowNumber: 3, reason: "Missing city." }],
        zone: new Map([
          [5, ok(rural)],
          [2, ok(rural)],
        ]),
        benefit: new Map([
          [5, ok(eligible)],
          [2, ok(eligible)],
        ]),
      }),
    );

    expect(report.rows.map((result) => result.rowNumber)).toEqual([2, 3, 4, 5]);
  });

  test("counts located, verification, rural, and area-eligible rows", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(1), located(2)],
        unlocated: [{ rowNumber: 3 }],
        zone: new Map([
          [1, ok(rural)],
          [2, ok(notRural)],
        ]),
        benefit: new Map([
          [1, ok(averaged)],
          [2, ok(averaged)],
        ]),
      }),
    );

    expect(report.total).toBe(3);
    expect(report.located).toBe(2);
    expect(report.needingVerification).toBe(1);
    expect(report.ruralCount).toBe(1);
    expect(report.areaEligibleCount).toBe(2);
  });

  test("reports an empty run as empty rather than failing", () => {
    const report = buildEligibilityReport(input());

    expect(report).toMatchObject({ total: 0, located: 0, needingVerification: 0, ruralCount: 0, areaEligibleCount: 0 });
    expect(report.rows).toEqual([]);
  });
});
