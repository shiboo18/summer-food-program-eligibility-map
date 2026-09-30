/** A geographic coordinate in WGS84 (EPSG:4326). */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

/** Which service produced a geocode. */
export type GeocodeSource = "smarty" | "esri";

/** A resolved coordinate for an address, with the match quality that produced it. */
export interface GeocodeResult {
  readonly point: GeoPoint;
  /** Match score 0–100; 100 is an exact match. */
  readonly score: number;
  readonly matchedAddress: string;
  readonly source: GeocodeSource;
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
