/**
 * Every port the backend depends on, in one place. Implementations live under
 * services/ (one folder per external system); the logic that consumes them lives
 * under core/ and depends only on this file and types/.
 */

import type { Address, AddressVerificationResult } from "./types/address.js";
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
   * Adds the standardized-address and deliverability columns and color-codes the
   * cells, without touching the user's original columns. Reads `filePath` and
   * writes the result to `options.outputPath`, so the partner's workbook is left
   * as it was.
   */
  annotateResults(
    filePath: string,
    annotations: readonly ResultAnnotation[],
    options: ResultColumnOptions,
  ): Promise<void>;
}

/* USDA eligibility ports. */

import type { GeocodeResult, GeoPoint, AreaEligibilityResult, RuralResult } from "./types/eligibility.js";

/**
 * A minimal HTTP-GET-returning-JSON seam. The USDA and Esri services depend on
 * this interface so tests can stub network responses instead of making real
 * calls.
 */
export interface JsonHttpClient {
  getJson(url: string, params: Record<string, string>): Promise<unknown>;
}

export interface Geocoder {
  /** Resolves an address to a coordinate, or `undefined` when it cannot be located. */
  geocode(address: Address): Promise<GeocodeResult | undefined>;
}

export interface RuralChecker {
  /** Determines whether a coordinate falls in a USDA-designated rural area. */
  check(point: GeoPoint): Promise<RuralResult>;
}

export interface AreaEligibilityChecker {
  /** Determines the 3-state USDA area eligibility for a coordinate. */
  check(point: GeoPoint): Promise<AreaEligibilityResult>;
}
