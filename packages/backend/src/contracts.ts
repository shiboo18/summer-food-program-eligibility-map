/**
 * Every port the backend depends on, in one place. Implementations live under
 * services/ (one folder per external system); the logic that consumes them lives
 * under core/ and depends only on this file and types/.
 */

import type { Address, AddressVerificationResult } from "./types/address.js";
import type {
  AreaEligibilityResult,
  CheckOutcome,
  GeocodeResult,
  LocatedRow,
  RuralResult,
} from "./types/eligibility.js";
import type { ProgressReporter } from "./types/progress.js";
import type {
  AddressRowsResult,
  ColumnMapping,
  ResultAnnotation,
  ResultColumnOptions,
  SpreadsheetSummary,
} from "./types/spreadsheet.js";

export interface AddressValidator {
  /**
   * Validates addresses in batch and returns one result per input, in the same order.
   *
   * @param onProgress Called as the work goes, with the number of addresses
   *   finished so far. Implementations report at whatever granularity they work in.
   */
  validate(
    addresses: readonly Address[],
    onProgress?: ProgressReporter,
  ): Promise<readonly AddressVerificationResult[]>;
}

export interface SpreadsheetReader {
  /** Reads the header names and data row count so the user can map columns. */
  readSummary(filePath: string): Promise<SpreadsheetSummary>;

  /** Builds one address per data row using the user's column mapping. */
  readAddressRows(filePath: string, mapping: ColumnMapping): Promise<AddressRowsResult>;
}

export interface SpreadsheetWriter {
  /**
   * Adds the deliverability, rural, and area columns and color-codes the cells,
   * without touching the user's original columns. Reads `filePath` and writes the
   * result to `options.outputPath`, so the partner's workbook is left as it was.
   */
  annotateResults(
    filePath: string,
    annotations: readonly ResultAnnotation[],
    options: ResultColumnOptions,
  ): Promise<void>;
}

export interface Geocoder {
  /** Resolves an address to a coordinate, or `undefined` when it cannot be located. */
  geocode(address: Address): Promise<GeocodeResult | undefined>;
}

/**
 * Checks located rows against the USDA rural zone map.
 *
 * Batch rather than per-point because a sheet is the unit of work: the
 * implementation owns how it paces its own requests, and the caller gets one
 * outcome per row keyed by row number. Rows absent from the returned map were
 * not handed to it.
 */
export interface RuralZoneChecker {
  checkZoneBatch(
    rows: readonly LocatedRow[],
    onProgress?: ProgressReporter,
  ): Promise<ReadonlyMap<number, CheckOutcome<RuralResult>>>;
}

/** Checks located rows against the USDA summer meal benefit (area eligibility) map. */
export interface SummerMealBenefitChecker {
  checkBenefitBatch(
    rows: readonly LocatedRow[],
    onProgress?: ProgressReporter,
  ): Promise<ReadonlyMap<number, CheckOutcome<AreaEligibilityResult>>>;
}

/**
 * The JSON-over-HTTP seam. Every outbound service only ever GETs. One instance is
 * created per external system with that system's base URL injected, so callers
 * pass a path rather than a whole URL. Tests substitute this wholesale, or pass a
 * fake `fetch` to the real client.
 */
export interface HttpGetClient {
  get(path: string, params?: Record<string, string>): Promise<unknown>;
}
