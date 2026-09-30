import { describe, expect, test, vi } from "vitest";

import type { Address } from "../../../types/address.js";
import type { JsonHttpClient } from "../../../contracts.js";
import { ESRI_GEOCODER_URL } from "../../../config/constants.js";
import { EsriGeocoder } from "../esri-geocoder.js";

function address(line1: string): Address {
  return { line1, city: "Wildersville", state: "TN", postalCode: "38388", countryCode: "US" };
}

function httpReturning(payload: unknown): { getJson: JsonHttpClient["getJson"] } {
  return { getJson: vi.fn(async () => payload) };
}

describe("EsriGeocoder", () => {
  test("returns the top candidate's point, score, and matched address", async () => {
    const http = httpReturning({
      candidates: [{ address: "24845 Natchez Trace Rd", location: { x: -88.2646, y: 35.7968 }, score: 100 }],
    });
    const geocoder = new EsriGeocoder(http);

    const result = await geocoder.geocode(address("24845 Natchez Trace Rd"));

    expect(result).toEqual({
      point: { lat: 35.7968, lng: -88.2646 },
      score: 100,
      matchedAddress: "24845 Natchez Trace Rd",
      source: "esri",
    });
  });

  test("passes a single-line address and JSON format to the endpoint", async () => {
    const getJson = vi.fn(async () => ({ candidates: [{ location: { x: 1, y: 2 }, score: 84 }] }));
    const geocoder = new EsriGeocoder({ getJson });

    await geocoder.geocode(address("506 S Campbell St"));

    expect(getJson).toHaveBeenCalledWith(ESRI_GEOCODER_URL, {
      singleLine: "506 S Campbell St, Wildersville, TN 38388",
      outFields: "Match_addr",
      maxLocations: "1",
      f: "json",
    });
  });

  test("returns undefined when there are no candidates", async () => {
    const geocoder = new EsriGeocoder(httpReturning({ candidates: [] }));

    await expect(geocoder.geocode(address("nowhere"))).resolves.toBeUndefined();
  });

  test("throws when the service reports an error payload", async () => {
    const geocoder = new EsriGeocoder(httpReturning({ error: { code: 400, message: "bad" } }));

    await expect(geocoder.geocode(address("1 Main St"))).rejects.toThrow("service reported an error");
  });

  test("wraps transport failures without leaking details", async () => {
    const geocoder = new EsriGeocoder({
      getJson: async () => {
        throw new Error("socket hang up");
      },
    });

    await expect(geocoder.geocode(address("1 Main St"))).rejects.toThrow("could not be located");
  });
});
