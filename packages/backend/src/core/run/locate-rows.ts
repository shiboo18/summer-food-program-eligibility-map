import type { Geocoder } from "../../contracts.js";
import type { GeocodeResult, LocatedRow, ValidatedLocation } from "../../types/eligibility.js";
import type { ProgressReporter } from "../../types/progress.js";
import type { AddressRow } from "../../types/spreadsheet.js";
import { GEOCODE_MINIMUM_MATCH_SCORE, USDA_CHECK_CONCURRENCY } from "../../config/constants.js";
import { mapWithConcurrency } from "./concurrency.js";
import { betterGeocode, isTrustedGeocode } from "./geocode-quality.js";

/** A row the run could not put on the map, so its USDA checks were not attempted. */
export interface UnlocatedRow {
  readonly rowNumber: number;
  /** Present when locating failed outright, absent when nothing simply matched. */
  readonly reason?: string;
}

export interface LocateRowsResult {
  readonly located: readonly LocatedRow[];
  readonly unlocated: readonly UnlocatedRow[];
}

export interface LocateRowsOptions {
  /** What validation already found for each row, keyed by row number. */
  readonly seeds?: ReadonlyMap<number, ValidatedLocation>;
  readonly onProgress?: ProgressReporter;
  readonly concurrency?: number;
  /** Match score below which a coordinate is not relied on, whatever its precision. */
  readonly minimumMatchScore?: number;
}

/**
 * Resolve a coordinate for every row, so the USDA checks get rows that carry one.
 *
 * A row that cannot be located, or whose lookup fails, is returned as unlocated
 * rather than dropped, so the report can account for it and the sheet finishes.
 */
export async function locateRows(
  rows: readonly AddressRow[],
  geocoder: Geocoder,
  options: LocateRowsOptions = {},
): Promise<LocateRowsResult> {
  const {
    seeds = new Map<number, ValidatedLocation>(),
    onProgress,
    concurrency = USDA_CHECK_CONCURRENCY,
    minimumMatchScore = GEOCODE_MINIMUM_MATCH_SCORE,
  } = options;

  const outcomes = await mapWithConcurrency(
    rows,
    concurrency,
    async (row) => resolveGeocode(row, seeds.get(row.rowNumber), geocoder, minimumMatchScore),
    onProgress,
  );

  const located: LocatedRow[] = [];
  const unlocated: UnlocatedRow[] = [];
  rows.forEach((row, index) => {
    const outcome = outcomes[index];
    if (outcome === undefined || !outcome.ok) {
      unlocated.push({ rowNumber: row.rowNumber, ...(outcome === undefined ? {} : { reason: outcome.reason }) });
      return;
    }
    if (outcome.value === undefined) {
      unlocated.push({ rowNumber: row.rowNumber });
      return;
    }
    located.push({ rowNumber: row.rowNumber, address: row.address, geocode: outcome.value });
  });

  return { located, unlocated };
}

/**
 * Resolve a coordinate for a row.
 *
 * A trusted Smarty coordinate is used as is. Otherwise the geocoder is asked as
 * well, with Smarty's standardized address so a corrected address is looked up
 * in its corrected form, and the tighter of the two wins.
 */
async function resolveGeocode(
  row: AddressRow,
  seed: ValidatedLocation | undefined,
  geocoder: Geocoder,
  minimumScore: number,
): Promise<GeocodeResult | undefined> {
  if (seed !== undefined && isTrustedGeocode(seed.geocode, minimumScore)) {
    return seed.geocode;
  }
  const fallback = await geocoder.geocode(seed?.standardizedAddress ?? row.address);
  if (fallback === undefined) {
    return seed?.geocode;
  }
  if (seed === undefined) {
    return fallback;
  }
  return betterGeocode(seed.geocode, fallback);
}
