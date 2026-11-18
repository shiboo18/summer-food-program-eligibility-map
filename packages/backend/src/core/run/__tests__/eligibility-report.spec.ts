import { describe, expect, test } from "vitest";

import type { Address } from "../../../types/address.js";
import type { AreaEligibilityResult, LocatedRow, LocationPrecision, RuralResult } from "../../../types/eligibility.js";
import { buildEligibilityReport, type EligibilityReportInput } from "../eligibility-report.js";

const address: Address = { line1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", countryCode: "US" };

function located(rowNumber: number, precision: LocationPrecision = "rooftop"): LocatedRow {
  return { rowNumber, address, geocode: { point: { lat: 1, lng: 2 }, score: 100, precision } };
}

const rural: RuralResult = { designation: "rural" };
const notRural: RuralResult = { designation: "not-rural" };
const eligible: AreaEligibilityResult = { eligibility: "eligible" };
const averaged: AreaEligibilityResult = { eligibility: "averaged-eligible" };

function input(overrides: Partial<EligibilityReportInput> = {}): EligibilityReportInput {
  return { located: [], unchecked: [], zone: new Map(), benefit: new Map(), ...overrides };
}

describe("buildEligibilityReport", () => {
  test("when a row is located and both checks answer, reports its precision and both results", () => {
    const report = buildEligibilityReport(
      input({ located: [located(7, "street")], zone: new Map([[7, rural]]), benefit: new Map([[7, eligible]]) }),
    );

    expect(report.rows).toEqual([{ rowNumber: 7, precision: "street", rural, area: eligible }]);
  });

  test("when a check did not run, leaves it off the row", () => {
    const report = buildEligibilityReport(input({ located: [located(1)], zone: new Map([[1, rural]]) }));

    expect(report.rows[0]?.rural).toEqual(rural);
    expect(report.rows[0]?.area).toBeUndefined();
  });

  test("when a check failed, leaves it off the row and keeps the other result and the location", () => {
    const report = buildEligibilityReport(
      input({ located: [located(1, "postal")], zone: new Map([[1, undefined]]), benefit: new Map([[1, eligible]]) }),
    );

    expect(report.rows[0]).toEqual({ rowNumber: 1, precision: "postal", rural: undefined, area: eligible });
  });

  test("when a row went unchecked, reports it by number alone", () => {
    const report = buildEligibilityReport(input({ unchecked: [3] }));

    expect(report.rows).toEqual([{ rowNumber: 3 }]);
  });

  test("counts an unchecked row in the total but never as rural or eligible", () => {
    const report = buildEligibilityReport(
      input({ located: [located(1)], unchecked: [2], zone: new Map([[1, rural]]), benefit: new Map([[1, eligible]]) }),
    );

    expect(report.total).toBe(2);
    expect(report.ruralCount).toBe(1);
    expect(report.areaEligibleCount).toBe(1);
  });

  test("orders every row by its number whichever pass produced it", () => {
    const report = buildEligibilityReport(input({ located: [located(5), located(2)], unchecked: [4, 3] }));

    expect(report.rows.map((result) => result.rowNumber)).toEqual([2, 3, 4, 5]);
  });

  test("counts averaged-eligible rows as area eligible and not-rural rows as not rural", () => {
    const report = buildEligibilityReport(
      input({
        located: [located(1), located(2)],
        zone: new Map([
          [1, rural],
          [2, notRural],
        ]),
        benefit: new Map([
          [1, averaged],
          [2, averaged],
        ]),
      }),
    );

    expect(report.ruralCount).toBe(1);
    expect(report.areaEligibleCount).toBe(2);
  });

  test("when the run is empty, reports zero counts and no rows", () => {
    const report = buildEligibilityReport(input());

    expect(report).toEqual({ total: 0, ruralCount: 0, areaEligibleCount: 0, rows: [] });
  });
});
