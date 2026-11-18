import { describe, expect, test, vi } from "vitest";

import type { Address } from "../../../types/address.js";
import type { LocatedRow } from "../../../types/eligibility.js";
import { UsdaRuralZoneMapChecker } from "../usda-rural-zone-map-checker.js";

const address: Address = {
  line1: "1 Main St",
  city: "Wildersville",
  state: "TN",
  postalCode: "38388",
  countryCode: "US",
};

/** A located row at a distinct coordinate, so a geometry-keyed stub can tell rows apart. */
function located(rowNumber: number, lat = 35.7968, lng = -88.2646): LocatedRow {
  return { rowNumber, address, geocode: { point: { lat, lng }, score: 100, precision: "rooftop" } };
}

/** Stubs one service-level `layers[]` response, count per layer id in order. */
function httpReturningLayers(counts: readonly number[]) {
  return {
    get: vi.fn(async () => ({ layers: counts.map((count, id) => ({ id, count })) })),
  };
}

describe("UsdaRuralZoneMapChecker", () => {
  test("is rural when any layer intersects", async () => {
    const checker = new UsdaRuralZoneMapChecker(httpReturningLayers([0, 0, 0, 0, 1]));

    const outcomes = await checker.checkZoneBatch([located(1)]);

    expect(outcomes.get(1)).toEqual({ designation: "rural" });
  });

  test("reads counts by layer id however the service orders the array", async () => {
    const checker = new UsdaRuralZoneMapChecker({
      get: vi.fn(async () => ({
        layers: [
          { id: 4, count: 1 },
          { id: 1, count: 1 },
          { id: 0, count: 0 },
        ],
      })),
    });

    const outcomes = await checker.checkZoneBatch([located(1)]);

    expect(outcomes.get(1)).toEqual({ designation: "rural" });
  });

  test("ignores a count for a layer it did not ask about", async () => {
    const checker = new UsdaRuralZoneMapChecker({ get: vi.fn(async () => ({ layers: [{ id: 9, count: 1 }] })) });

    const outcomes = await checker.checkZoneBatch([located(1)]);

    expect(outcomes.get(1)).toEqual({ designation: "not-rural" });
  });

  test("is not rural when no layer intersects", async () => {
    const checker = new UsdaRuralZoneMapChecker(httpReturningLayers([0, 0, 0, 0, 0]));

    const outcomes = await checker.checkZoneBatch([located(1)]);

    expect(outcomes.get(1)).toEqual({ designation: "not-rural" });
  });

  test("asks all five layers in one layerDefs point query", async () => {
    const http = httpReturningLayers([0, 0, 0, 0, 0]);
    const checker = new UsdaRuralZoneMapChecker(http);

    await checker.checkZoneBatch([located(1)]);

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledWith("query", {
      layerDefs: '{"0":"","1":"","2":"","3":"","4":""}',
      geometry: "-88.2646,35.7968",
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      returnCountOnly: "true",
      f: "json",
    });
  });

  test("keys every outcome by row number rather than position", async () => {
    const checker = new UsdaRuralZoneMapChecker(httpReturningLayers([0, 0, 0, 0, 0]));

    const outcomes = await checker.checkZoneBatch([located(12), located(4, 36, -87), located(9, 34, -86)]);

    expect([...outcomes.keys()].sort((left, right) => left - right)).toEqual([4, 9, 12]);
  });

  test("asks once for two rows at the same coordinate and shares the result", async () => {
    const http = httpReturningLayers([0, 0, 0, 0, 1]);
    const checker = new UsdaRuralZoneMapChecker(http);

    const outcomes = await checker.checkZoneBatch([located(1), located(2)]);

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(outcomes.get(1)).toEqual({ designation: "rural" });
    expect(outcomes.get(2)).toEqual({ designation: "rural" });
  });

  test("shares one failed lookup between duplicate rows rather than retrying", async () => {
    const http = {
      get: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    };
    const checker = new UsdaRuralZoneMapChecker(http);

    const outcomes = await checker.checkZoneBatch([located(1), located(2)]);

    expect(http.get).toHaveBeenCalledTimes(1);
    expect([...outcomes]).toEqual([
      [1, undefined],
      [2, undefined],
    ]);
  });

  test("when the service reports an error for one row, leaves that row without a result and checks the rest", async () => {
    const checker = new UsdaRuralZoneMapChecker({
      get: vi.fn(async (_path: string, params?: Record<string, string>) =>
        params?.geometry === "-88.2646,35.7968"
          ? { error: { code: 400 } }
          : { layers: [{ id: 4, count: 1 }] },
      ),
    });

    const outcomes = await checker.checkZoneBatch([located(1), located(2, 36, -87)]);

    expect(outcomes.get(1)).toBeUndefined();
    expect(outcomes.get(2)).toEqual({ designation: "rural" });
  });

  test("treats a malformed response without a layers array as a failure, not as not rural", async () => {
    const checker = new UsdaRuralZoneMapChecker({ get: vi.fn(async () => ({ count: 1 })) });

    const outcomes = await checker.checkZoneBatch([located(1)]);

    expect(outcomes.has(1)).toBe(true);
    expect(outcomes.get(1)).toBeUndefined();
  });

  test("counts progress once per row", async () => {
    const checker = new UsdaRuralZoneMapChecker(httpReturningLayers([0, 0, 0, 0, 0]));
    const reported: number[] = [];

    await checker.checkZoneBatch([located(1), located(2, 36, -87), located(3, 34, -86)], (completed) =>
      reported.push(completed),
    );

    expect(reported).toEqual([1, 2, 3]);
  });

  test("returns an empty map for an empty batch without calling the service", async () => {
    const http = httpReturningLayers([0, 0, 0, 0, 0]);
    const checker = new UsdaRuralZoneMapChecker(http);

    await expect(checker.checkZoneBatch([])).resolves.toEqual(new Map());
    expect(http.get).not.toHaveBeenCalled();
  });
});
