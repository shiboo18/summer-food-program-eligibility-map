import { describe, expect, test, vi } from "vitest";

import type { Address } from "../../../types/address.js";
import type { CheckOutcome, LocatedRow } from "../../../types/eligibility.js";
import { UsdaSummerMealBenefitChecker } from "../usda-summer-meal-benefit-checker.js";

const address: Address = {
  line1: "1 Main St",
  city: "Wildersville",
  state: "TN",
  postalCode: "38388",
  countryCode: "US",
};

function located(rowNumber: number, lat = 35.7968, lng = -88.2646): LocatedRow {
  return { rowNumber, address, geocode: { point: { lat, lng }, score: 100, precision: "rooftop", matchedAddress: "1 MAIN ST" } };
}

function httpReturning(payload: unknown) {
  return { get: vi.fn(async () => payload) };
}

function featurePayload(attributes: Record<string, unknown>): unknown {
  return { features: [{ attributes }] };
}

function value<Value>(outcome: CheckOutcome<Value> | undefined): Value {
  if (outcome === undefined || !outcome.ok) {
    throw new Error(`Expected a value but got ${JSON.stringify(outcome)}`);
  }
  return outcome.value;
}

function reason(outcome: CheckOutcome<unknown> | undefined): string {
  if (outcome === undefined || outcome.ok) {
    throw new Error(`Expected a failure but got ${JSON.stringify(outcome)}`);
  }
  return outcome.reason;
}

describe("UsdaSummerMealBenefitChecker", () => {
  test("maps the independently-eligible (orange) value with evidence fields", async () => {
    const checker = new UsdaSummerMealBenefitChecker(
      httpReturning(
        featurePayload({
          FY26_Eligibility: "Eligible",
          GEOID: "470370137011",
          County: "Davidson",
          BGPct18: 66.7,
          TractPct18: 79.2,
          PctPovBG_all: null,
        }),
      ),
    );

    const outcomes = await checker.checkBenefitBatch([located(1)]);

    expect(value(outcomes.get(1))).toEqual({
      eligibility: "eligible",
      geoid: "470370137011",
      county: "Davidson",
      blockGroupPct: 66.7,
      tractPct: 79.2,
      averagedPct: undefined,
    });
  });

  test("maps the averaged-eligible (blue) value", async () => {
    const checker = new UsdaSummerMealBenefitChecker(
      httpReturning(featurePayload({ FY26_Eligibility: "Averaged Eligible", TractPct18: 48.3, PctPovBG_all: 0.57 })),
    );

    const result = value((await checker.checkBenefitBatch([located(1)])).get(1));

    expect(result.eligibility).toBe("averaged-eligible");
    expect(result.tractPct).toBe(48.3);
    expect(result.averagedPct).toBe(0.57);
  });

  test("maps the not-eligible (gray) value", async () => {
    const checker = new UsdaSummerMealBenefitChecker(
      httpReturning(featurePayload({ FY26_Eligibility: "Not Eligible" })),
    );

    const outcomes = await checker.checkBenefitBatch([located(1)]);

    expect(value(outcomes.get(1))).toMatchObject({ eligibility: "not-eligible" });
  });

  /* Nothing containing the point is an answer, not a failure, so it stays on the
     value arm. */
  test("returns unknown when no block group contains the point", async () => {
    const checker = new UsdaSummerMealBenefitChecker(httpReturning({ features: [] }));

    const outcomes = await checker.checkBenefitBatch([located(1)]);

    expect(value(outcomes.get(1))).toEqual({ eligibility: "unknown" });
  });

  test("returns unknown for an unrecognized eligibility value", async () => {
    const checker = new UsdaSummerMealBenefitChecker(
      httpReturning(featurePayload({ FY26_Eligibility: "Something Else" })),
    );

    const outcomes = await checker.checkBenefitBatch([located(1)]);

    expect(value(outcomes.get(1))).toMatchObject({ eligibility: "unknown" });
  });

  test("requests the eligibility and evidence fields for the point", async () => {
    const http = httpReturning({ features: [] });
    const checker = new UsdaSummerMealBenefitChecker(http);

    await checker.checkBenefitBatch([located(1)]);

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining("query"), {
      geometry: "-88.2646,35.7968",
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "FY26_Eligibility,GEOID,County,BGPct18,TractPct18,PctPovBG_all",
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
    expect(value(outcomes.get(1)).eligibility).toBe("eligible");
    expect(value(outcomes.get(2)).eligibility).toBe("eligible");
  });

  /* One request, one outcome: a duplicate takes the first row's failure rather
     than retrying it. */
  test("shares one failed lookup between duplicate rows rather than retrying", async () => {
    const http = {
      get: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    };
    const checker = new UsdaSummerMealBenefitChecker(http);

    const outcomes = await checker.checkBenefitBatch([located(1), located(2)]);

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(reason(outcomes.get(1))).toContain("could not be determined");
    expect(reason(outcomes.get(2))).toContain("could not be determined");
  });

  test("reports an error payload against its own row and still checks the rest", async () => {
    const checker = new UsdaSummerMealBenefitChecker({
      get: vi.fn(async (_path: string, params?: Record<string, string>) =>
        params?.geometry === "-88.2646,35.7968"
          ? { error: { code: 400 } }
          : featurePayload({ FY26_Eligibility: "Eligible" }),
      ),
    });

    const outcomes = await checker.checkBenefitBatch([located(1), located(2, 36, -87)]);

    expect(reason(outcomes.get(1))).toContain("service reported an error");
    expect(value(outcomes.get(2)).eligibility).toBe("eligible");
  });

  test("reports a transport failure without leaking its detail", async () => {
    const checker = new UsdaSummerMealBenefitChecker({
      get: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    });

    const outcomes = await checker.checkBenefitBatch([located(1)]);

    expect(reason(outcomes.get(1))).toContain("could not be determined");
    expect(reason(outcomes.get(1))).not.toContain("socket hang up");
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
