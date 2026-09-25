import type { Address } from "./address.js";

/** A geographic coordinate in WGS84 (EPSG:4326). */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

/**
 * How precisely a coordinate is placed, which is what decides whether it can be
 * trusted to fall inside the right census block group. Both providers report a
 * class of their own; these are the classes those map onto.
 *
 * This is deliberately separate from the match score. A score says how well the
 * text matched, not where the point landed — a bare "Lebanon, VA 24266" scores
 * 100 while returning a ZIP centroid, beating a real rooftop match on the same
 * street.
 */
export type LocationPrecision = "rooftop" | "street" | "postal" | "locality" | "unknown";

/** A resolved coordinate for an address, with the match quality that produced it. */
export interface GeocodeResult {
  readonly point: GeoPoint;
  /** Match score 0–100: how well the address matched, not how precisely it is placed. */
  readonly score: number;
  readonly precision: LocationPrecision;
  readonly matchedAddress: string;
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
  /** Human-readable rural criteria (layer names) that matched, if any. */
  readonly matchedCriteria: readonly string[];
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
  readonly geoid?: string;
  readonly county?: string;
  readonly blockGroupPct?: number;
  readonly tractPct?: number;
  readonly averagedPct?: number;
}

/** Confidence in a row's location, derived from the geocode score. */
export type LocationConfidence = "high" | "low" | "none";

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

/**
 * The result of checking one row: either the value, or why that row failed.
 *
 * A batch of thousands of rows has to finish, so a single row's failure is
 * returned as a value rather than thrown. Both arms must be handled where the
 * report is built, which the compiler enforces — a failure cannot be forgotten.
 *
 * Single-point calls still throw the domain errors they always did; the batch
 * wrapper is what turns a throw into the `ok: false` arm.
 */
export type CheckOutcome<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly reason: string };

/** Which USDA checks the user selected to run. */
export interface EligibilityChecks {
  readonly rural: boolean;
  readonly area: boolean;
}

/** Per-row outcome of the eligibility pipeline. */
export interface EligibilityRowResult {
  readonly rowNumber: number;
  readonly matchedAddress?: string;
  readonly score?: number;
  /** How precisely the row was placed; absent when it could not be located. */
  readonly precision?: LocationPrecision;
  readonly confidence: LocationConfidence;
  /** True when the location is too approximate to trust the USDA verdicts. */
  readonly needsVerification: boolean;
  readonly rural?: RuralResult;
  readonly area?: AreaEligibilityResult;
  readonly messages: readonly string[];
}

/** Summary of an eligibility run over a spreadsheet's mapped rows. */
export interface EligibilityReport {
  readonly fileName: string;
  readonly total: number;
  readonly located: number;
  readonly needingVerification: number;
  readonly ruralCount: number;
  readonly areaEligibleCount: number;
  readonly rows: readonly EligibilityRowResult[];
}
