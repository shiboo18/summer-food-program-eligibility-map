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
    for (const geocoder of this.geocoders) {
      const result = await geocoder.geocode(address);
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
    return best;
  }
}
