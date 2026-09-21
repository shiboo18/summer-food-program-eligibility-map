import SmartySDK from "smartystreets-javascript-sdk";
import { describe, expect, test, vi } from "vitest";

import type { Address } from "../../../types/address.js";
import { SmartyGeocoder, type SmartyGeocoderClientFactory } from "../smarty-geocoder.js";

type Batch = InstanceType<typeof SmartySDK.core.Batch>;
type Lookup = InstanceType<typeof SmartySDK.usStreet.Lookup>;

const anAddress: Address = { line1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", countryCode: "US" };
const credentials = async () => ({ authId: "auth-id", authToken: "auth-token" });

function candidate(precision: string, latitude?: number, longitude?: number) {
  return new SmartySDK.usStreet.Candidate({
    delivery_line_1: "1 MAIN ST",
    metadata: { latitude, longitude, precision },
  });
}

describe("SmartyGeocoder", () => {
  test("returns a high-confidence result for a rooftop-precision match", async () => {
    const send = vi.fn(async (batch: Batch): Promise<void> => {
      (batch.getByIndex(0) as Lookup).result.push(candidate("Rooftop", 30.27, -97.74));
    });
    const geocoder = new SmartyGeocoder(credentials, () => ({ send }));

    const result = await geocoder.geocode(anAddress);

    expect(result).toEqual({
      point: { lat: 30.27, lng: -97.74 },
      score: 100,
      matchedAddress: "1 MAIN ST",
      source: "smarty",
    });
  });

  test("scores a coarse (block-level) match below the confidence threshold", async () => {
    const send = vi.fn(async (batch: Batch): Promise<void> => {
      (batch.getByIndex(0) as Lookup).result.push(candidate("Zip9", 30.27, -97.74));
    });
    const geocoder = new SmartyGeocoder(credentials, () => ({ send }));

    const result = await geocoder.geocode(anAddress);

    expect(result?.score).toBe(85);
    expect(result?.source).toBe("smarty");
  });

  test("returns undefined when Smarty has no coordinate", async () => {
    const send = vi.fn(async (batch: Batch): Promise<void> => {
      (batch.getByIndex(0) as Lookup).result.push(candidate("Zip5"));
    });
    const geocoder = new SmartyGeocoder(credentials, () => ({ send }));

    await expect(geocoder.geocode(anAddress)).resolves.toBeUndefined();
  });

  test("requires both credentials before calling Smarty", async () => {
    const createClient = vi.fn<SmartyGeocoderClientFactory>();
    const geocoder = new SmartyGeocoder(async () => ({ authId: "auth-id", authToken: undefined }), createClient);

    await expect(geocoder.geocode(anAddress)).rejects.toThrow("Configure Smarty");
    expect(createClient).not.toHaveBeenCalled();
  });

  test("wraps SDK failures without exposing provider details", async () => {
    const geocoder = new SmartyGeocoder(credentials, () => ({
      send: async (): Promise<void> => {
        throw new Error("low-level failure");
      },
    }));

    await expect(geocoder.geocode(anAddress)).rejects.toThrow("Smarty could not locate the address");
  });
});
