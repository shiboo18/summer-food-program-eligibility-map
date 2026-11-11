import type { Geocoder } from "../../contracts.js";
import type { GeocodeResult, LocatedRow, ValidatedLocation } from "../../types/eligibility.js";
import type { ProgressReporter } from "../../types/progress.js";
import type { AddressRow } from "../../types/spreadsheet.js";
import { USDA_CHECK_CONCURRENCY } from "../../config/constants.js";
import { mapWithConcurrency } from "./concurrency.js";
import { betterGeocode, isTrustedGeocode } from "./geocode-quality.js";

export interface LocateRowsOptions {
  /** What validation already found for each row, keyed by row number. */
  readonly seeds?: ReadonlyMap<number, ValidatedLocation>;
  readonly onProgress?: ProgressReporter;
}

/**
 * Resolve a coordinate for every row, so the USDA checks get rows that carry one.
 *
 * A row that cannot be located, or whose lookup fails, is returned by number in
 * `unlocated` rather than dropped, so the report can account for it.
 */
export async function locateRows(
  rows: readonly AddressRow[],
  geocoder: Geocoder,
  options: LocateRowsOptions = {},
): Promise<{ readonly located: readonly LocatedRow[]; readonly unlocated: readonly number[] }> {
  const { seeds = new Map<number, ValidatedLocation>(), onProgress } = options;

  const geocodes = await mapWithConcurrency(
    rows,
    USDA_CHECK_CONCURRENCY,
    async (row) => resolveGeocode(row, seeds.get(row.rowNumber), geocoder),
    onProgress,
  );

  const located: LocatedRow[] = [];
  const unlocated: number[] = [];
  rows.forEach((row, index) => {
    const geocode = geocodes[index];
    if (geocode === undefined) {
      unlocated.push(row.rowNumber);
    } else {
      located.push({ rowNumber: row.rowNumber, address: row.address, geocode });
    }
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
): Promise<GeocodeResult | undefined> {
  if (seed !== undefined && isTrustedGeocode(seed.geocode)) {
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
