/**
 * Every port the backend depends on. Implementations live under services/, one
 * folder per external system; core/ depends only on this file and types/.
 */

import type { Address, AddressVerificationResult } from "./types/address.js";
import type { ResolvedSmartyCredentials, SmartyCredentials } from "./types/credentials.js";
import type { AreaEligibilityResult, GeocodeResult, LocatedRow, RuralResult } from "./types/eligibility.js";
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
   * Validate addresses in batch, returning one result per input in input order.
   *
   * @param onProgress Called with the number of addresses finished so far, at
   *   whatever granularity the implementation works in.
   */
  validate(
    addresses: readonly Address[],
    onProgress?: ProgressReporter,
  ): Promise<readonly AddressVerificationResult[]>;
}

/**
 * Asks the address provider whether a secret key is accepted, without
 * submitting an address, so a check costs the partner no lookups.
 */
export interface CredentialVerifier {
  /**
   * Return the key with the provider's verdict on it. Never rejects: a network
   * failure or an unexpected response resolves as `"unreachable"`.
   */
  verify(credentials: SmartyCredentials): Promise<ResolvedSmartyCredentials>;
}

export interface SpreadsheetReader {
  /** Read the header names and data row count so the user can map columns. */
  readSummary(filePath: string): Promise<SpreadsheetSummary>;

  /** Build one address per data row using the user's column mapping. */
  readAddressRows(filePath: string, mapping: ColumnMapping): Promise<AddressRowsResult>;
}

export interface SpreadsheetWriter {
  /**
   * Add the deliverability, rural, and area columns and color-code the cells.
   * Reads `filePath` and writes to `options.outputPath`, so the partner's
   * workbook and original columns are left untouched.
   */
  annotateResults(
    filePath: string,
    annotations: readonly ResultAnnotation[],
    options: ResultColumnOptions,
  ): Promise<void>;
}

export interface Geocoder {
  /** Resolve an address to a coordinate, or `undefined` when it cannot be located. */
  geocode(address: Address): Promise<GeocodeResult | undefined>;
}

/**
 * Checks located rows against the USDA rural zone map.
 *
 * Batch rather than per-point because a sheet is the unit of work: the
 * implementation paces its own requests and returns one value per row, keyed by
 * row number. A row whose check failed maps to `undefined`, so one bad row
 * cannot stop the sheet.
 */
export interface RuralZoneChecker {
  checkZoneBatch(
    rows: readonly LocatedRow[],
    onProgress?: ProgressReporter,
  ): Promise<ReadonlyMap<number, RuralResult | undefined>>;
}

/** Checks located rows against the USDA summer meal benefit (area eligibility) map, as {@link RuralZoneChecker}. */
export interface SummerMealBenefitChecker {
  checkBenefitBatch(
    rows: readonly LocatedRow[],
    onProgress?: ProgressReporter,
  ): Promise<ReadonlyMap<number, AreaEligibilityResult | undefined>>;
}

/**
 * The JSON-over-HTTP GET seam. Each external system gets its own instance with
 * its base URL injected, so callers pass a path rather than a whole URL. Tests
 * replace it, or pass a fake `fetch` to the real client.
 */
export interface HttpGetClient {
  get(path: string, params?: Record<string, string>): Promise<unknown>;
}
