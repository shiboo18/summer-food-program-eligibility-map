import { describe, expect, test, vi } from "vitest";

import type { Geocoder } from "../../../contracts.js";
import type { Address } from "../../../types/address.js";
import type { GeocodeResult, LocationPrecision, ValidatedLocation } from "../../../types/eligibility.js";
import type { AddressRow } from "../../../types/spreadsheet.js";
import { locateRows } from "../locate-rows.js";

function address(line1: string): Address {
  return { line1, city: "Austin", state: "TX", postalCode: "78701", countryCode: "US" };
}

function row(rowNumber: number, line1 = "1 Main St"): AddressRow {
  return { rowNumber, address: address(line1) };
}

function geocode(precision: LocationPrecision, score = 100, matchedAddress = "1 MAIN ST"): GeocodeResult {
  return { point: { lat: 1, lng: 2 }, score, precision, matchedAddress };
}

function seed(geocodeResult: GeocodeResult, standardizedAddress?: Address): ValidatedLocation {
  return { geocode: geocodeResult, ...(standardizedAddress === undefined ? {} : { standardizedAddress }) };
}

function seedsFor(rowNumber: number, location: ValidatedLocation): ReadonlyMap<number, ValidatedLocation> {
  return new Map([[rowNumber, location]]);
}

function geocoderReturning(result: GeocodeResult | undefined): Geocoder {
  return { geocode: vi.fn(async () => result) };
}

describe("locateRows", () => {
  test("geocodes a row with no seed and carries its number and address onto the located row", async () => {
    const { located, unlocated } = await locateRows([row(7)], geocoderReturning(geocode("rooftop")));

    expect(unlocated).toEqual([]);
    expect(located).toEqual([{ rowNumber: 7, address: row(7).address, geocode: geocode("rooftop") }]);
  });

  test("keeps a rooftop seed and never calls the geocoder", async () => {
    const geocoder = geocoderReturning(geocode("rooftop"));
    const seeds = seedsFor(1, seed(geocode("rooftop", 100, "SEED")));

    const { located } = await locateRows([row(1)], geocoder, { seeds });

    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(located[0]?.geocode.matchedAddress).toBe("SEED");
  });

  test("keeps a street-level seed, which is tight enough for a block group", async () => {
    const geocoder = geocoderReturning(geocode("rooftop"));
    const seeds = seedsFor(1, seed(geocode("street", 100, "SEED")));

    const { located } = await locateRows([row(1)], geocoder, { seeds });

    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(located[0]?.geocode.matchedAddress).toBe("SEED");
  });

  /* A ZIP centroid can sit in the wrong block group, so the geocoder gets a go. */
  test("falls back for a postal seed and takes the tighter class", async () => {
    const geocoder = geocoderReturning(geocode("rooftop", 97, "GEOCODED"));
    const seeds = seedsFor(1, seed(geocode("postal", 100, "SEED")));

    const { located } = await locateRows([row(1)], geocoder, { seeds });

    expect(geocoder.geocode).toHaveBeenCalledTimes(1);
    expect(located[0]?.geocode).toMatchObject({ precision: "rooftop", matchedAddress: "GEOCODED" });
  });

  /* The whole point of carrying the standardized address: a corrected address is
     looked up in its corrected form, not as the partner typed it. */
  test("geocodes Smarty's standardized address rather than the row's raw input", async () => {
    const geocoder = geocoderReturning(geocode("rooftop", 97, "GEOCODED"));
    const corrected = address("1 MAIN STREET APT 4");
    const seeds = seedsFor(1, seed(geocode("postal"), corrected));

    await locateRows([row(1, "1 man st")], geocoder, { seeds });

    expect(geocoder.geocode).toHaveBeenCalledWith(corrected);
  });

  test("falls back to the row's own address when there is no standardized one", async () => {
    const geocoder = geocoderReturning(geocode("rooftop", 97));
    const seeds = seedsFor(1, seed(geocode("postal")));

    await locateRows([row(1, "1 man st")], geocoder, { seeds });

    expect(geocoder.geocode).toHaveBeenCalledWith(address("1 man st"));
  });

  /* A perfect-scoring ZIP centroid must not beat a slightly-imperfect rooftop:
     the score says how well the text matched, not where the point landed. */
  test("does not let a better-scoring postal match beat a rooftop one", async () => {
    const geocoder = geocoderReturning(geocode("postal", 100, "GEOCODED"));
    const seeds = seedsFor(1, seed(geocode("rooftop", 93, "SEED")));

    const { located } = await locateRows([row(1)], geocoder, { seeds });

    expect(located[0]?.geocode).toMatchObject({ precision: "rooftop", matchedAddress: "SEED" });
  });

  test("breaks a tie within the same class on the match score", async () => {
    const geocoder = geocoderReturning(geocode("postal", 95, "GEOCODED"));
    const seeds = seedsFor(1, seed(geocode("postal", 80, "SEED")));

    const { located } = await locateRows([row(1)], geocoder, { seeds });

    expect(located[0]?.geocode.matchedAddress).toBe("GEOCODED");
  });

  test("keeps a rooftop seed whose score is below the floor only if nothing better arrives", async () => {
    const seeds = seedsFor(1, seed(geocode("rooftop", 50, "SEED")));

    const { located } = await locateRows([row(1)], geocoderReturning(undefined), { seeds });

    expect(located[0]?.geocode.matchedAddress).toBe("SEED");
  });

  test("asks the geocoder when a rooftop seed scores below the floor", async () => {
    const geocoder = geocoderReturning(geocode("rooftop", 99, "GEOCODED"));
    const seeds = seedsFor(1, seed(geocode("rooftop", 50, "SEED")));

    const { located } = await locateRows([row(1)], geocoder, { seeds });

    expect(geocoder.geocode).toHaveBeenCalledTimes(1);
    expect(located[0]?.geocode.matchedAddress).toBe("GEOCODED");
  });

  test("honours an explicit match-score floor", async () => {
    const geocoder = geocoderReturning(geocode("rooftop", 99));
    const seeds = seedsFor(1, seed(geocode("rooftop", 60, "SEED")));

    const { located } = await locateRows([row(1)], geocoder, { seeds, minimumMatchScore: 60 });

    expect(geocoder.geocode).not.toHaveBeenCalled();
    expect(located[0]?.geocode.matchedAddress).toBe("SEED");
  });

  test("separates out a row nothing can locate, without a reason", async () => {
    const { located, unlocated } = await locateRows([row(3, "fake")], geocoderReturning(undefined));

    expect(located).toEqual([]);
    expect(unlocated).toEqual([{ rowNumber: 3 }]);
  });

  /* A geocoder outage must not abandon the sheet: the row is recorded with why. */
  test("records a geocoder failure against its row and still locates the others", async () => {
    const geocoder: Geocoder = {
      geocode: vi.fn(async (candidate: Address) => {
        if (candidate.line1 === "boom") {
          throw new Error("The address could not be located. Check your connection and try again.");
        }
        return geocode("rooftop");
      }),
    };

    const { located, unlocated } = await locateRows([row(1, "boom"), row(2)], geocoder);

    expect(located.map((entry) => entry.rowNumber)).toEqual([2]);
    expect(unlocated).toEqual([{ rowNumber: 1, reason: expect.stringContaining("could not be located") }]);
  });

  test("counts progress once per row, failures included", async () => {
    const geocoder: Geocoder = {
      geocode: vi.fn(async (candidate: Address) => {
        if (candidate.line1 === "boom") {
          throw new Error("down");
        }
        return geocode("rooftop");
      }),
    };
    const reported: number[] = [];

    await locateRows([row(1), row(2, "boom"), row(3)], geocoder, {
      concurrency: 1,
      onProgress: (completed) => reported.push(completed),
    });

    expect(reported).toEqual([1, 2, 3]);
  });

  test("handles an empty sheet", async () => {
    const geocoder = geocoderReturning(geocode("rooftop"));

    await expect(locateRows([], geocoder)).resolves.toEqual({ located: [], unlocated: [] });
    expect(geocoder.geocode).not.toHaveBeenCalled();
  });
});
