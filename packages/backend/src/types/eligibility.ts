import type { Address } from "./address.js";

/** A geographic coordinate in WGS84 (EPSG:4326). */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

/**
 * How precisely a coordinate is placed, which decides whether it can be trusted
 * to fall in the right census block group. Each provider's own classes map onto
 * these.
 *
 * Deliberately separate from the match score, which says how well the text
 * matched, not where the point landed: a bare "Lebanon, VA 24266" scores 100
 * while returning a ZIP centroid.
 */
export type LocationPrecision = "rooftop" | "street" | "postal" | "locality" | "unknown";

/** A resolved coordinate for an address, with the match quality that produced it. */
export interface GeocodeResult {
  readonly point: GeoPoint;
  /** Match score 0–100: how well the address matched, not how precisely it is placed. */
  readonly score: number;
  readonly precision: LocationPrecision;
}

/**
 * What address validation learned about a row that the eligibility pass can
 * reuse, so Smarty is asked once per run.
 */
export interface ValidatedLocation {
  readonly geocode: GeocodeResult;
  /**
   * Smarty's standardized address. The geocoder is given this rather than the
   * row's raw input, so a corrected address is looked up in its corrected form.
   */
  readonly standardizedAddress?: Address;
}

/** Whether an address falls in a USDA-designated rural area. */
export type RuralDesignation = "rural" | "not-rural";

export interface RuralResult {
  readonly designation: RuralDesignation;
}

/**
 * The three USDA area-eligibility states, plus `unknown` when no block-group
 * polygon contains the point.
 * - `eligible` — independently ≥50% (the map's "orange").
 * - `averaged-eligible` — eligible only via averaging adjacent block groups AND
 *   with State agency + FNS Regional Office approval (the map's "blue").
 * - `not-eligible` — below threshold (the map's "gray").
 */
export type AreaEligibility = "eligible" | "averaged-eligible" | "not-eligible" | "unknown";

export interface AreaEligibilityResult {
  readonly eligibility: AreaEligibility;
}

/**
 * A row whose coordinate has been resolved, so it is ready to be checked. The
 * USDA checks take these rather than bare points, so each result can be keyed
 * back to the spreadsheet row it came from.
 */
export interface LocatedRow {
  readonly rowNumber: number;
  readonly address: Address;
  readonly geocode: GeocodeResult;
}

/** Which USDA checks the user selected to run. */
export interface EligibilityChecks {
  readonly rural: boolean;
  readonly area: boolean;
}

/** Per-row outcome of the eligibility pipeline. A check that did not run or failed leaves its value absent. */
export interface EligibilityRowResult {
  readonly rowNumber: number;
  /** How precisely the row was placed; absent when it could not be located. */
  readonly precision?: LocationPrecision;
  readonly rural?: RuralResult;
  readonly area?: AreaEligibilityResult;
}

/** Summary of an eligibility run over a spreadsheet's mapped rows. */
export interface EligibilityReport {
  readonly total: number;
  readonly ruralCount: number;
  readonly areaEligibleCount: number;
  readonly rows: readonly EligibilityRowResult[];
}
