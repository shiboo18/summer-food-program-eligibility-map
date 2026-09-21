import { describe, expect, test, vi } from "vitest";

import type { Address } from "../../../types/address.js";
import type { Geocoder } from "../../../contracts.js";
import type { GeocodeResult, GeocodeSource } from "../../../types/eligibility.js";
import { FallbackGeocoder } from "../fallback-geocoder.js";

const anAddress: Address = { line1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", countryCode: "US" };

function stub(result: GeocodeResult | undefined): Geocoder {
  return { geocode: vi.fn(async () => result) };
}

function result(score: number, source: GeocodeSource): GeocodeResult {
  return { point: { lat: 1, lng: 2 }, score, matchedAddress: "m", source };
}

describe("FallbackGeocoder", () => {
  test("returns the first result that meets the confidence threshold, skipping later geocoders", async () => {
    const second = stub(result(100, "esri"));
    const geocoder = new FallbackGeocoder([stub(result(100, "smarty")), second]);

    const geocoded = await geocoder.geocode(anAddress);

    expect(geocoded?.source).toBe("smarty");
    expect(second.geocode).not.toHaveBeenCalled();
  });

  test("falls back to the next geocoder when the first returns nothing", async () => {
    const geocoder = new FallbackGeocoder([stub(undefined), stub(result(100, "esri"))]);

    await expect(geocoder.geocode(anAddress)).resolves.toMatchObject({ source: "esri", score: 100 });
  });

  test("returns the best-scoring result when none meets the threshold", async () => {
    const geocoder = new FallbackGeocoder([stub(result(85, "smarty")), stub(result(97, "esri"))]);

    await expect(geocoder.geocode(anAddress)).resolves.toMatchObject({ source: "esri", score: 97 });
  });

  test("returns undefined when no geocoder can locate the address", async () => {
    const geocoder = new FallbackGeocoder([stub(undefined), stub(undefined)]);

    await expect(geocoder.geocode(anAddress)).resolves.toBeUndefined();
  });

  test("continues to the next geocoder when one throws", async () => {
    const throwing: Geocoder = {
      geocode: vi.fn(async () => {
        throw new Error("Smarty outage");
      }),
    };
    const geocoder = new FallbackGeocoder([throwing, stub(result(100, "esri"))]);

    await expect(geocoder.geocode(anAddress)).resolves.toMatchObject({ source: "esri", score: 100 });
  });

  test("throws the last error only when every geocoder fails", async () => {
    const throwing = (message: string): Geocoder => ({
      geocode: vi.fn(async () => {
        throw new Error(message);
      }),
    });
    const geocoder = new FallbackGeocoder([throwing("smarty down"), throwing("esri down")]);

    await expect(geocoder.geocode(anAddress)).rejects.toThrow("esri down");
  });

  test("prefers a returned result over a thrown geocoder", async () => {
    const throwing: Geocoder = {
      geocode: vi.fn(async () => {
        throw new Error("esri down");
      }),
    };
    const geocoder = new FallbackGeocoder([stub(result(85, "smarty")), throwing]);

    await expect(geocoder.geocode(anAddress)).resolves.toMatchObject({ source: "smarty", score: 85 });
  });

  test("requires at least one geocoder", () => {
    expect(() => new FallbackGeocoder([])).toThrow("at least one geocoder");
  });
});
