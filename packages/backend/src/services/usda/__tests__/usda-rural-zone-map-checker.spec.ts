import { describe, expect, test, vi } from "vitest";

import type { Address } from "../../../types/address.js";
import type { CheckOutcome, LocatedRow } from "../../../types/eligibility.js";
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
  return { rowNumber, address, geocode: { point: { lat, lng }, score: 100, precision: "rooftop", matchedAddress: "1 MAIN ST" } };
}

/** Stubs one service-level `layers[]` response, count per layer id in order. */
function httpReturningLayers(counts: readonly number[]) {
  return {
    get: vi.fn(async () => ({ layers: counts.map((count, id) => ({ id, count })) })),
  };
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

describe("UsdaRuralZoneMapChecker", () => {
  test("is rural when any layer intersects, and reports the matched criteria", async () => {
    const checker = new UsdaRuralZoneMapChecker(httpReturningLayers([0, 0, 0, 0, 1]));

    const outcomes = await checker.checkZoneBatch([located(1)]);

    expect(value(outcomes.get(1))).toEqual({
      designation: "rural",
      matchedCriteria: ["Census tract rural designation"],
    });
  });

  test("collects every matched criterion in configured layer order", async () => {
    const checker = new UsdaRuralZoneMapChecker(httpReturningLayers([1, 1, 0, 0, 0]));

    const outcomes = await checker.checkZoneBatch([located(1)]);

    expect(value(outcomes.get(1)).matchedCriteria).toEqual([
      "MSA — not part of a Census urban area",
      "County not part of an MSA",
    ]);
  });

  test("reads counts by layer id however the service orders the array", async () => {
    /* The response shape is `layers[]` with `id` and `count`; the id, not the
       array position, decides which criterion matched. */
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

    expect(value(outcomes.get(1)).matchedCriteria).toEqual([
      "County not part of an MSA",
      "Census tract rural designation",
    ]);
  });

  test("is not rural when no layer intersects", async () => {
    const checker = new UsdaRuralZoneMapChecker(httpReturningLayers([0, 0, 0, 0, 0]));

    const outcomes = await checker.checkZoneBatch([located(1)]);

    expect(value(outcomes.get(1))).toEqual({ designation: "not-rural", matchedCriteria: [] });
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
    expect(value(outcomes.get(1)).designation).toBe("rural");
    expect(value(outcomes.get(2)).designation).toBe("rural");
  });

  /* One request, one outcome: a duplicate takes the first row's failure rather
     than retrying it four more times. */
  test("shares one failed lookup between duplicate rows rather than retrying", async () => {
    const http = {
      get: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    };
    const checker = new UsdaRuralZoneMapChecker(http);

    const outcomes = await checker.checkZoneBatch([located(1), located(2)]);

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(reason(outcomes.get(1))).toContain("could not be determined");
    expect(reason(outcomes.get(2))).toContain("could not be determined");
  });

  /* A failed row is a value in the map, not a thrown error, so the sheet finishes. */
  test("reports an error payload against its own row and still checks the rest", async () => {
    const checker = new UsdaRuralZoneMapChecker({
      get: vi.fn(async (_path: string, params?: Record<string, string>) =>
        params?.geometry === "-88.2646,35.7968"
          ? { error: { code: 400 } }
          : { layers: [{ id: 4, count: 1 }] },
      ),
    });

    const outcomes = await checker.checkZoneBatch([located(1), located(2, 36, -87)]);

    expect(reason(outcomes.get(1))).toContain("service reported an error");
    expect(value(outcomes.get(2)).designation).toBe("rural");
  });

  test("reports a malformed response without a layers array as a failure", async () => {
    const checker = new UsdaRuralZoneMapChecker({ get: vi.fn(async () => ({ count: 1 })) });

    const outcomes = await checker.checkZoneBatch([located(1)]);

    expect(reason(outcomes.get(1))).toContain("unexpected response");
  });

  test("reports a transport failure without leaking its detail", async () => {
    const checker = new UsdaRuralZoneMapChecker({
      get: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    });

    const outcomes = await checker.checkZoneBatch([located(1)]);

    expect(reason(outcomes.get(1))).toContain("could not be determined");
    expect(reason(outcomes.get(1))).not.toContain("socket hang up");
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
