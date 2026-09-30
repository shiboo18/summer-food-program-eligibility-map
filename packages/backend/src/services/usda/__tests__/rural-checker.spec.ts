import { describe, expect, test, vi, type Mock } from "vitest";

import type { JsonHttpClient } from "../../../contracts.js";
import type { GeoPoint } from "../../../types/eligibility.js";
import { UsdaRuralChecker } from "../rural-checker.js";

const point: GeoPoint = { lat: 35.7968, lng: -88.2646 };

/** Stubs one `{ count }` response per layer query, in call order. */
function httpReturningCounts(counts: readonly number[]): { getJson: Mock<JsonHttpClient["getJson"]> } {
  let call = 0;
  return {
    getJson: vi.fn(async () => {
      const count = counts[call] ?? 0;
      call += 1;
      return { count };
    }),
  };
}

describe("UsdaRuralChecker", () => {
  test("is rural when any layer intersects, and reports the matched criteria", async () => {
    const http = httpReturningCounts([0, 0, 0, 0, 1]);
    const checker = new UsdaRuralChecker(http);

    const result = await checker.check(point);

    expect(result.designation).toBe("rural");
    expect(result.matchedCriteria).toEqual(["Census tract rural designation"]);
  });

  test("collects every matched criterion", async () => {
    const checker = new UsdaRuralChecker(httpReturningCounts([1, 1, 0, 0, 0]));

    const result = await checker.check(point);

    expect(result.matchedCriteria).toEqual([
      "MSA — not part of a Census urban area",
      "County not part of an MSA",
    ]);
  });

  test("is not rural when no layer intersects", async () => {
    const checker = new UsdaRuralChecker(httpReturningCounts([0, 0, 0, 0, 0]));

    await expect(checker.check(point)).resolves.toEqual({ designation: "not-rural", matchedCriteria: [] });
  });

  test("queries each layer with an intersects point query", async () => {
    const http = httpReturningCounts([0, 0, 0, 0, 0]);
    const checker = new UsdaRuralChecker(http);

    await checker.check(point);

    expect(http.getJson).toHaveBeenCalledTimes(5);
    expect(http.getJson).toHaveBeenNthCalledWith(1, expect.stringContaining("/0/query"), {
      geometry: "-88.2646,35.7968",
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      returnCountOnly: "true",
      f: "json",
    });
  });

  test("throws when a layer reports an error payload", async () => {
    const checker = new UsdaRuralChecker({ getJson: vi.fn(async () => ({ error: { code: 400 } })) });

    await expect(checker.check(point)).rejects.toThrow("service reported an error");
  });

  test("wraps transport failures without leaking details", async () => {
    const checker = new UsdaRuralChecker({
      getJson: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    });

    await expect(checker.check(point)).rejects.toThrow("could not be determined");
  });
});
