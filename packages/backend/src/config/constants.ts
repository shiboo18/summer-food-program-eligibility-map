/**
 * Single source of truth for the externally-tunable values in the app.
 *
 * Address-validation flow: the result-column header names and the thresholds
 * that decide where a sheet's column names and data rows begin.
 *
 * USDA eligibility pipeline: third-party endpoints, ArcGIS layer ids, feature
 * field names, the geocode-confidence gate, and the dataset year. A yearly USDA
 * data refresh or an endpoint swap is a one-file change here.
 */

/** Header names for the result columns appended to the sponsor's spreadsheet. */
export const RESULT_COLUMNS = {
  standardized: "Standardized Address",
  deliverability: "Address Checks",
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

/** Esri World Geocoder — free/anonymous single-candidate lookup. Returns a match score (0–100). */
export const ESRI_GEOCODER_URL =
  "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";

/** USDA Rural Development "SummerMeals" rural-designation service (first-party USDA). */
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

/** No Kid Hungry SFSP area-eligibility layer (census block groups, FY26). */
export const AREA_ELIGIBILITY_LAYER_URL =
  "https://services3.arcgis.com/oCXqDjkrf39VolHS/arcgis/rest/services/SFSP_Avg_Elig_2026/FeatureServer/0";

/**
 * The 3-state eligibility field. NOTE: use this, not `ELIGFY26`, which only
 * flags the independently-eligible ("orange") case and misses the
 * averaged-eligible ("blue") case.
 */
export const AREA_ELIGIBILITY_FIELD = "FY26_Eligibility";

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
 * Geocode match score (0–100) at or above which a location is trusted. Below
 * this, the row is flagged "location approximate — please verify" because a
 * fuzzy or ZIP-centroid match can land in the wrong census block group.
 */
export const GEOCODE_CONFIDENCE_THRESHOLD = 100;

/** USDA eligibility dataset edition currently wired in. */
export const USDA_DATASET_YEAR = 2026;
