import { describe, expect, test, vi } from "vitest";

import type { Address } from "../../../types/address.js";
import type { LocatedRow } from "../../../types/eligibility.js";
import { UsdaSummerMealBenefitChecker } from "../usda-summer-meal-benefit-checker.js";

const address: Address = {
  line1: "1 Main St",
  city: "Wildersville",
  state: "TN",
  postalCode: "38388",
  countryCode: "US",
};

function located(rowNumber: number, lat = 35.7968, lng = -88.2646): LocatedRow {
  return { rowNumber, address, geocode: { point: { lat, lng }, score: 100, precision: "rooftop" } };
}

function httpReturning(payload: unknown) {
  return { get: vi.fn(async () => payload) };
}

function featurePayload(attributes: Record<string, unknown>): unknown {
  return { features: [{ attributes }] };
}

describe("UsdaSummerMealBenefitChecker", () => {
  test.each([
    { field: "Eligible", eligibility: "eligible" },
    { field: "Averaged Eligible", eligibility: "averaged-eligible" },
    { field: "Not Eligible", eligibility: "not-eligible" },
    { field: "Something Else", eligibility: "unknown" },
  ])("when the block group reads $field, the row is $eligibility", async ({ field, eligibility }) => {
    const checker = new UsdaSummerMealBenefitChecker(httpReturning(featurePayload({ FY26_Eligibility: field })));

    const outcomes = await checker.checkBenefitBatch([located(1)]);

    expect(outcomes.get(1)).toEqual({ eligibility });
  });

  /* Nothing containing the point is an answer, not a failure. */
  test("returns unknown when no block group contains the point", async () => {
    const checker = new UsdaSummerMealBenefitChecker(httpReturning({ features: [] }));

    const outcomes = await checker.checkBenefitBatch([located(1)]);

    expect(outcomes.get(1)).toEqual({ eligibility: "unknown" });
  });

  test("requests only the eligibility field for the point", async () => {
    const http = httpReturning({ features: [] });
    const checker = new UsdaSummerMealBenefitChecker(http);

    await checker.checkBenefitBatch([located(1)]);

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("query"), {
      geometry: "-88.2646,35.7968",
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "FY26_Eligibility",
      returnGeometry: "false",
      f: "json",
    });
  });

  test("keys every outcome by row number and asks once per row", async () => {
    const http = httpReturning({ features: [] });
    const checker = new UsdaSummerMealBenefitChecker(http);

    const outcomes = await checker.checkBenefitBatch([located(12), located(4, 36, -87), located(9, 34, -86)]);

    expect([...outcomes.keys()].sort((left, right) => left - right)).toEqual([4, 9, 12]);
    expect(http.get).toHaveBeenCalledTimes(3);
  });

  test("asks once for two rows at the same coordinate and shares the result", async () => {
    const http = httpReturning(featurePayload({ FY26_Eligibility: "Eligible" }));
    const checker = new UsdaSummerMealBenefitChecker(http);

    const outcomes = await checker.checkBenefitBatch([located(1), located(2)]);

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(outcomes.get(1)).toEqual({ eligibility: "eligible" });
    expect(outcomes.get(2)).toEqual({ eligibility: "eligible" });
  });

  test("shares one failed lookup between duplicate rows rather than retrying", async () => {
    const http = {
      get: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    };
    const checker = new UsdaSummerMealBenefitChecker(http);

    const outcomes = await checker.checkBenefitBatch([located(1), located(2)]);

    expect(http.get).toHaveBeenCalledTimes(1);
    expect([...outcomes]).toEqual([
      [1, undefined],
      [2, undefined],
    ]);
  });

  test("when the service reports an error for one row, leaves that row without a result and checks the rest", async () => {
    const checker = new UsdaSummerMealBenefitChecker({
      get: vi.fn(async (_path: string, params?: Record<string, string>) =>
        params?.geometry === "-88.2646,35.7968"
          ? { error: { code: 400 } }
          : featurePayload({ FY26_Eligibility: "Eligible" }),
      ),
    });

    const outcomes = await checker.checkBenefitBatch([located(1), located(2, 36, -87)]);

    expect(outcomes.get(1)).toBeUndefined();
    expect(outcomes.get(2)).toEqual({ eligibility: "eligible" });
  });

  test("counts progress once per row", async () => {
    const checker = new UsdaSummerMealBenefitChecker(httpReturning({ features: [] }));
    const reported: number[] = [];

    await checker.checkBenefitBatch([located(1), located(2, 36, -87)], (completed) => reported.push(completed));

    expect(reported).toEqual([1, 2]);
  });

  test("returns an empty map for an empty batch without calling the service", async () => {
    const http = httpReturning({ features: [] });
    const checker = new UsdaSummerMealBenefitChecker(http);

    await expect(checker.checkBenefitBatch([])).resolves.toEqual(new Map());
    expect(http.get).not.toHaveBeenCalled();
  });
});
