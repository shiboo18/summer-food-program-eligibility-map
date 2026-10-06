/**
 * Single source of truth for every externally-tunable value in the USDA
 * eligibility pipeline: third-party endpoints, ArcGIS layer ids, feature field
 * names, the geocode-confidence gate, and the dataset year. A yearly USDA data
 * refresh or an endpoint swap is a one-file change here.
 *
 * YEARLY REFRESH: USDA/No Kid Hungry publish a new eligibility dataset each
 * fiscal year. When the new edition ships, bump USDA_DATASET_YEAR and point
 * AREA_ELIGIBILITY_LAYER_URL at the new `SFSP_Avg_Elig_<year>` service. The
 * eligibility field name derives from the year automatically. The layer's
 * org/service id can change year to year, so the URL stays explicit — verify
 * it and the field names against the live service before shipping.
 */

/** USDA eligibility dataset edition currently wired in. Drives the field name below. */
export const USDA_DATASET_YEAR = 2026;

/** Header names for the result columns appended to the sponsor's spreadsheet. */
export const RESULT_COLUMNS = {
  standardized: "Standardized Address",
  deliverability: "Address Checks",
  location: "Address Match Level",
  rural: "USDA Rural",
  area: "USDA Eligibility",
} as const;

/** Esri World Geocoder — free/anonymous single-candidate lookup. Returns a match score (0–100). */
export const ESRI_GEOCODE_SERVICE_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

/** Operation path on the geocode service. */
export const ESRI_FIND_CANDIDATES_PATH = "findAddressCandidates";

/**
 * USDA Rural Development "SummerMeals" rural-designation service (first-party USDA).
 * The layers behind USDA's own tool: https://www.fna.usda.gov/sfsp/mapping-tools/rural-designation
 */
export const USDA_RURAL_SERVICE_URL =
  "https://services.arcgis.com/UbyviKPk0x1UemzF/arcgis/rest/services/SummerMeals_RuralDesignation/FeatureServer";

/** The five rural-criteria layers; an address in ANY layer is rural. */
export const USDA_RURAL_LAYER_IDS: readonly number[] = [0, 1, 2, 3, 4];

/**
 * Human-readable label for each rural-criteria layer, keyed by layer id. Source
 * layer names: MSA_notpartofaCensusUrbanArea, CountiesNotPartofMSA,
 * Counties_UIC, Counties_RUCC, CensusTractsSummerMeals.
 */
export const USDA_RURAL_CRITERIA: Readonly<Record<number, string>> = {
  0: "MSA — not part of a Census urban area",
  1: "County not part of an MSA",
  2: "County Urban Influence Code",
  3: "County Rural-Urban Continuum Code",
  4: "Census tract rural designation",
};

/**
 * No Kid Hungry SFSP area-eligibility layer (census block groups, FY26).
 * The rules this layer encodes: https://www.fna.usda.gov/cn/area-eligibility
 */
export const AREA_ELIGIBILITY_LAYER_URL =
  "https://services3.arcgis.com/oCXqDjkrf39VolHS/arcgis/rest/services/SFSP_Avg_Elig_2026/FeatureServer/0";

/**
 * The 3-state eligibility field, derived from the dataset year (2026 ->
 * `FY26_Eligibility`). NOTE: use this, not `ELIGFY26`, which only flags the
 * independently-eligible ("orange") case and misses the averaged-eligible
 * ("blue") case.
 *
 * Verify the field against the layer wired above, not against USDA's catalogued
 * dataset (https://usda-fns.hub.arcgis.com/datasets/USDA-FNS::participants-eligible-for-free-and-reduced-price-fy-26/about).
 * That entry points at a different hosted layer which publishes `ELIGFY26` alone,
 * so reading it as the authority loses the averaged-eligible case.
 */
export const AREA_ELIGIBILITY_FIELD = `FY${String(USDA_DATASET_YEAR % 100).padStart(2, "0")}_Eligibility`;

/** Supporting evidence fields returned alongside the eligibility verdict. */
export const AREA_EVIDENCE_FIELDS = {
  geoid: "GEOID",
  county: "County",
  blockGroupPct: "BGPct18",
  tractPct: "TractPct18",
  averagedPct: "PctPovBG_all",
} as const;

/** Raw `FY26_Eligibility` values as they appear in the source layer. */
export const AREA_ELIGIBILITY_VALUES = {
  eligible: "Eligible",
  averagedEligible: "Averaged Eligible",
  notEligible: "Not Eligible",
} as const;

/**
 * Match score (0–100) below which a coordinate is not relied on, whatever its
 * precision class. The class says how tightly the point is placed; this says
 * whether the right address was found at all, since a confidently typed rooftop
 * match against the wrong street is still wrong.
 *
 * Not a substitute for the class: a bare "Lebanon, VA 24266" scores 100 and
 * returns a ZIP centroid, so score alone would trust it.
 */
export const GEOCODE_MINIMUM_MATCH_SCORE = 90;

/**
 * Points checked at once against one public map service. Bounded because these
 * are requests against someone else's free service: too many at once invites
 * throttling, and one at a time makes a large sheet needlessly slow.
 */
export const USDA_CHECK_CONCURRENCY = 6;

/**
 * Transport settings shared by every outbound JSON request. A batch of thousands
 * of rows makes a 429 likely, so retrying is normal rather than exceptional: a
 * row is only reported as unchecked once the retries are exhausted.
 */
export const HTTP_CLIENT_CONFIG = {
  /** Per-attempt timeout in milliseconds. */
  timeoutMs: 15_000,
  /** Attempts after the first, for a throttled or transiently failed request. */
  retryLimit: 3,
  /**
   * Ceiling in milliseconds on a server-supplied `Retry-After`. The header is
   * honoured because the service knows its own limits, but a large value would
   * stall the whole batch on one row.
   */
  maxRetryAfterMs: 30_000,
} as const;

/**
 * How many leading rows are searched for the column names. A legend or title block
 * sits above the names in some partners' exports; past this many rows a sheet is
 * malformed rather than merely decorated.
 */
export const HEADER_ROW_SCAN_LIMIT = 10;

/**
 * How full a row must be, against the fullest row scanned, to be taken for the
 * column names. A one- or two-cell legend falls well short; a name row does not.
 */
export const HEADER_ROW_MIN_DENSITY = 0.6;

/**
 * Filled cells a row below the names must have to count as a record. Sheets carry
 * whole columns filled down with one repeated value, and those rows are furniture.
 */
export const MIN_DATA_ROW_CELLS = 2;
