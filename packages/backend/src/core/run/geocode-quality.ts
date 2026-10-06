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
 * Whether a coordinate is placed tightly enough to decide which census block
 * group contains it.
 *
 * Rooftop and street-level points sit on the property or its street frontage, so
 * they fall in the right block group. A postal point is a ZIP or ZIP+4 centroid
 * that can sit streets away, and a locality point is a town centre — either can
 * land in a neighbouring block group and quietly produce the wrong verdict.
 */
export function isTrustedPrecision(precision: LocationPrecision): boolean {
  return precisionRank[precision] >= precisionRank.street;
}

/**
 * Whether a geocode can be relied on: placed tightly enough, and matched well
 * enough to be the right address in the first place. Both are needed — a
 * confidently typed rooftop match against the wrong street is still wrong.
 */
export function isTrustedGeocode(
  geocode: GeocodeResult,
  minimumScore: number = GEOCODE_MINIMUM_MATCH_SCORE,
): boolean {
  return isTrustedPrecision(geocode.precision) && geocode.score >= minimumScore;
}

/**
 * The better of two coordinates for the same address: the tighter class wins, and
 * the match score only breaks a tie within a class. Comparing scores across
 * classes would let a ZIP centroid scoring 100 beat a rooftop scoring 99.
 */
/**
 * A within-run cache key for a coordinate, so two rows resolved to the exact
 * same point share one USDA lookup.
 *
 * Keyed on the exact lat/lng with no rounding. Duplicates come from the same
 * geocoder response, so exact equality is safe; a rounded key could straddle a
 * census block-group boundary and hand one row another's verdict — the silent
 * wrong answer the precision work exists to prevent.
 */
export function coordinateKey(point: GeoPoint): string {
  return `${point.lat},${point.lng}`;
}

export function betterGeocode(left: GeocodeResult, right: GeocodeResult): GeocodeResult {
  const leftRank = precisionRank[left.precision];
  const rightRank = precisionRank[right.precision];
  if (leftRank !== rightRank) {
    return leftRank > rightRank ? left : right;
  }
  return right.score > left.score ? right : left;
}
