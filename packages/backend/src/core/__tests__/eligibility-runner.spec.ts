import { describe, expect, test, vi } from "vitest";

import type { Address } from "../../types/address.js";
import type { Geocoder, RuralChecker, AreaEligibilityChecker } from "../../contracts.js";
import type { AreaEligibilityResult, GeocodeResult, RuralResult } from "../../types/eligibility.js";
import type { AddressRow } from "../../types/spreadsheet.js";
import { EligibilityRunner } from "../eligibility-runner.js";

function row(rowNumber: number, line1: string): AddressRow {
  const address: Address = { line1, city: "Austin", state: "TX", postalCode: "78701", countryCode: "US" };
  return { rowNumber, address };
}

function geocode(score: number): GeocodeResult {
  return { point: { lat: 1, lng: 2 }, score, matchedAddress: "1 MAIN ST", source: "esri" };
}

const rural: RuralResult = { designation: "rural", matchedCriteria: ["Census tract rural designation"] };
const notRural: RuralResult = { designation: "not-rural", matchedCriteria: [] };
const areaEligible: AreaEligibilityResult = { eligibility: "eligible" };
const areaAveraged: AreaEligibilityResult = { eligibility: "averaged-eligible" };

function runner(overrides: {
  geocode?: (address: Address) => Promise<GeocodeResult | undefined>;
  rural?: RuralResult;
  area?: AreaEligibilityResult;
}): {
  runner: EligibilityRunner;
  geocoder: Geocoder;
  ruralChecker: RuralChecker;
  areaChecker: AreaEligibilityChecker;
} {
  const geocoder: Geocoder = { geocode: vi.fn(overrides.geocode ?? (async () => geocode(100))) };
  const ruralChecker: RuralChecker = { check: vi.fn(async () => overrides.rural ?? rural) };
  const areaChecker: AreaEligibilityChecker = { check: vi.fn(async () => overrides.area ?? areaEligible) };
  return { runner: new EligibilityRunner(geocoder, ruralChecker, areaChecker), geocoder, ruralChecker, areaChecker };
}

describe("EligibilityRunner", () => {
  test("runs both checks on a high-confidence row and keys the result by rowNumber", async () => {
    const { runner: subject } = runner({ rural, area: areaEligible });

    const report = await subject.run([row(7, "1 Main St")], { rural: true, area: true }, "file.xlsx");

    expect(report.rows).toHaveLength(1);
    const result = report.rows[0];
    expect(result).toMatchObject({
      rowNumber: 7,
      matchedAddress: "1 MAIN ST",
      score: 100,
      confidence: "high",
      needsVerification: false,
      rural,
      area: areaEligible,
    });
    expect(result.messages).toEqual([]);
  });

  test("runs only the selected checks", async () => {
    const { runner: subject, ruralChecker, areaChecker } = runner({});

    const report = await subject.run([row(1, "1 Main St")], { rural: true, area: false }, "file.xlsx");

    expect(ruralChecker.check).toHaveBeenCalledTimes(1);
    expect(areaChecker.check).not.toHaveBeenCalled();
    expect(report.rows[0].rural).toBeDefined();
    expect(report.rows[0].area).toBeUndefined();
  });

  test("flags a low-confidence geocode for verification but still runs checks", async () => {
    const { runner: subject } = runner({ geocode: async () => geocode(84) });

    const report = await subject.run([row(1, "1 Main St")], { rural: true, area: true }, "file.xlsx");

    const result = report.rows[0];
    expect(result.confidence).toBe("low");
    expect(result.needsVerification).toBe(true);
    expect(result.messages[0]).toContain("approximate");
    expect(result.area).toBeDefined();
  });

  test("skips checks and flags a row that cannot be located", async () => {
    const { runner: subject, ruralChecker, areaChecker } = runner({ geocode: async () => undefined });

    const report = await subject.run([row(3, "fake")], { rural: true, area: true }, "file.xlsx");

    const result = report.rows[0];
    expect(result).toMatchObject({ rowNumber: 3, confidence: "none", needsVerification: true });
    expect(result.messages[0]).toContain("could not be located");
    expect(ruralChecker.check).not.toHaveBeenCalled();
    expect(areaChecker.check).not.toHaveBeenCalled();
  });

  test("summarizes located, verification, rural, and area-eligible counts", async () => {
    const located = geocode(100);
    const geocoder: Geocoder = {
      geocode: vi.fn(async (address: Address) => (address.line1 === "bad" ? undefined : located)),
    };
    const ruralChecker: RuralChecker = {
      check: vi.fn().mockResolvedValueOnce(rural).mockResolvedValueOnce(notRural),
    };
    const areaChecker: AreaEligibilityChecker = { check: vi.fn(async () => areaAveraged) };
    const subject = new EligibilityRunner(geocoder, ruralChecker, areaChecker);

    const report = await subject.run(
      [row(1, "1 Main St"), row(2, "2 Main St"), row(3, "bad")],
      { rural: true, area: true },
      "file.xlsx",
    );

    expect(report.total).toBe(3);
    expect(report.located).toBe(2);
    expect(report.needingVerification).toBe(1);
    expect(report.ruralCount).toBe(1);
    expect(report.areaEligibleCount).toBe(2);
  });

  test("includes skipped rows in order, flagged for verification and not located", async () => {
    const { runner: subject } = runner({});

    const report = await subject.run(
      [row(3, "3 Main St")],
      { rural: true, area: true },
      "file.xlsx",
      [{ rowNumber: 2, reason: "Missing street address." }],
    );

    expect(report.total).toBe(2);
    expect(report.located).toBe(1);
    expect(report.rows.map((result) => result.rowNumber)).toEqual([2, 3]);
    const skippedResult = report.rows[0];
    expect(skippedResult).toMatchObject({ rowNumber: 2, confidence: "none", needsVerification: true });
    expect(skippedResult.messages).toEqual(["Missing street address."]);
  });
});
