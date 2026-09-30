import type { Address } from "../../types/address.js";
import type { Geocoder } from "../../contracts.js";
import type { GeocodeResult } from "../../types/eligibility.js";
import { GEOCODE_CONFIDENCE_THRESHOLD } from "../../config/constants.js";

/**
 * Tries an ordered list of geocoders. Returns the first result that meets the
 * confidence threshold; otherwise keeps trying and returns the best-scoring
 * result seen. This lets a rooftop Smarty match win immediately, falls back to
 * Esri when Smarty has no (or only a coarse) coordinate, and still surfaces a
 * low-confidence coordinate when that is all any provider can offer.
 */
export class FallbackGeocoder implements Geocoder {
  private readonly geocoders: readonly Geocoder[];

  public constructor(
    geocoders: readonly Geocoder[],
    private readonly confidenceThreshold: number = GEOCODE_CONFIDENCE_THRESHOLD,
  ) {
    if (geocoders.length === 0) {
      throw new Error("FallbackGeocoder requires at least one geocoder.");
    }
    this.geocoders = geocoders;
  }

  public async geocode(address: Address): Promise<GeocodeResult | undefined> {
    let best: GeocodeResult | undefined;
    let lastError: unknown;
    for (const geocoder of this.geocoders) {
      let result: GeocodeResult | undefined;
      try {
        result = await geocoder.geocode(address);
      } catch (error: unknown) {
        // A failing geocoder should not abort the chain; try the next one and
        // only surface an error if every geocoder fails.
        lastError = error;
        continue;
      }
      if (result === undefined) {
        continue;
      }
      if (result.score >= this.confidenceThreshold) {
        return result;
      }
      if (best === undefined || result.score > best.score) {
        best = result;
      }
    }
    if (best !== undefined) {
      return best;
    }
    if (lastError !== undefined) {
      throw lastError;
    }
    return undefined;
  }
}
