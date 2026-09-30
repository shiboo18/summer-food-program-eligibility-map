import { describe, expect, test, vi, type Mock } from "vitest";

import type { JsonHttpClient } from "../../../contracts.js";
import type { GeoPoint } from "../../../types/eligibility.js";
import { UsdaAreaEligibilityChecker } from "../area-eligibility-checker.js";

const point: GeoPoint = { lat: 35.7968, lng: -88.2646 };

function httpReturning(payload: unknown): { getJson: Mock<JsonHttpClient["getJson"]> } {
  return { getJson: vi.fn(async () => payload) };
}

function featurePayload(attributes: Record<string, unknown>): unknown {
  return { features: [{ attributes }] };
}

describe("UsdaAreaEligibilityChecker", () => {
  test("maps the independently-eligible (orange) value with evidence fields", async () => {
    const checker = new UsdaAreaEligibilityChecker(
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

    const result = await checker.check(point);

    expect(result).toEqual({
      eligibility: "eligible",
      geoid: "470370137011",
      county: "Davidson",
      blockGroupPct: 66.7,
      tractPct: 79.2,
      averagedPct: undefined,
    });
  });

  test("maps the averaged-eligible (blue) value", async () => {
    const checker = new UsdaAreaEligibilityChecker(
      httpReturning(featurePayload({ FY26_Eligibility: "Averaged Eligible", TractPct18: 48.3, PctPovBG_all: 0.57 })),
    );

    const result = await checker.check(point);

    expect(result.eligibility).toBe("averaged-eligible");
    expect(result.tractPct).toBe(48.3);
    expect(result.averagedPct).toBe(0.57);
  });

  test("maps the not-eligible (gray) value", async () => {
    const checker = new UsdaAreaEligibilityChecker(
      httpReturning(featurePayload({ FY26_Eligibility: "Not Eligible" })),
    );

    await expect(checker.check(point)).resolves.toMatchObject({ eligibility: "not-eligible" });
  });

  test("returns unknown when no block group contains the point", async () => {
    const checker = new UsdaAreaEligibilityChecker(httpReturning({ features: [] }));

    await expect(checker.check(point)).resolves.toEqual({ eligibility: "unknown" });
  });

  test("returns unknown for an unrecognized eligibility value", async () => {
    const checker = new UsdaAreaEligibilityChecker(
      httpReturning(featurePayload({ FY26_Eligibility: "Something Else" })),
    );

    await expect(checker.check(point)).resolves.toMatchObject({ eligibility: "unknown" });
  });

  test("requests the eligibility and evidence fields for the point", async () => {
    const http = httpReturning({ features: [] });
    const checker = new UsdaAreaEligibilityChecker(http);

    await checker.check(point);

    expect(http.getJson).toHaveBeenCalledWith(expect.stringContaining("/query"), {
      geometry: "-88.2646,35.7968",
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "FY26_Eligibility,GEOID,County,BGPct18,TractPct18,PctPovBG_all",
      returnGeometry: "false",
      f: "json",
    });
  });

  test("throws when the service reports an error payload", async () => {
    const checker = new UsdaAreaEligibilityChecker(httpReturning({ error: { code: 400 } }));

    await expect(checker.check(point)).rejects.toThrow("service reported an error");
  });

  test("wraps transport failures without leaking details", async () => {
    const checker = new UsdaAreaEligibilityChecker({
      getJson: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    });

    await expect(checker.check(point)).rejects.toThrow("could not be determined");
  });
});
