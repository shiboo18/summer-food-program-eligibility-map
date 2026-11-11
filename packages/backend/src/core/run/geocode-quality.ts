import type { GeocodeResult, GeoPoint, LocationPrecision } from "../../types/eligibility.js";
import { GEOCODE_MINIMUM_MATCH_SCORE } from "../../config/constants.js";

/**
 * How tightly each class places a point, worst to best. Ranking them lets two
 * providers be compared on the same axis, which their own scores cannot do.
 */
const precisionRank: Readonly<Record<LocationPrecision, number>> = {
  unknown: 0,
  locality: 1,
  postal: 2,
  street: 3,
  rooftop: 4,
};

/**
 * Return whether a coordinate is placed tightly enough to decide which census
 * block group contains it.
 *
 * Rooftop and street points sit on the property or its frontage. A postal point
 * is a ZIP centroid and a locality point a town centre; either can land in a
 * neighbouring block group and quietly give the wrong verdict.
 */
export function isTrustedPrecision(precision: LocationPrecision): boolean {
  return precisionRank[precision] >= precisionRank.street;
}

/**
 * Return whether a geocode can be relied on: placed tightly enough, and matched
 * well enough to be the right address. A rooftop match on the wrong street is
 * still wrong.
 */
export function isTrustedGeocode(
  geocode: GeocodeResult,
  minimumScore: number = GEOCODE_MINIMUM_MATCH_SCORE,
): boolean {
  return isTrustedPrecision(geocode.precision) && geocode.score >= minimumScore;
}

/**
 * Return a within-run cache key for a coordinate, so rows resolved to the same
 * point share one USDA lookup.
 *
 * Exact lat/lng, no rounding: duplicates come from the same geocoder response,
 * and a rounded key could straddle a block-group boundary and give one row
 * another's verdict.
 */
export function coordinateKey(point: GeoPoint): string {
  return `${point.lat},${point.lng}`;
}

/**
 * Return the better of two coordinates for the same address: the tighter class
 * wins, and the score only breaks a tie within a class, so a ZIP centroid scoring
 * 100 cannot beat a rooftop scoring 99.
 */
export function betterGeocode(left: GeocodeResult, right: GeocodeResult): GeocodeResult {
  const leftRank = precisionRank[left.precision];
  const rightRank = precisionRank[right.precision];
  if (leftRank !== rightRank) {
    return leftRank > rightRank ? left : right;
  }
  return right.score > left.score ? right : left;
}
