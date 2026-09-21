import type { AddressValidator, SpreadsheetReader } from "../contracts.js";
import type { Address, FailedAddress, RowVerification, ValidationReport } from "../types/address.js";
import type { GeocodeResult } from "../types/eligibility.js";
import type { ProgressReporter } from "../types/progress.js";
import type { AddressRowsResult, ColumnMapping } from "../types/spreadsheet.js";

/** A validation report plus what the results annotation needs, keyed by row number. */
export interface SpreadsheetValidationResult {
  readonly report: ValidationReport;
  /** Per-row verification outcome, keyed by row number, for the results annotation. */
  readonly verifications: ReadonlyMap<number, RowVerification>;
  /** The rows parsed from the workbook. */
  readonly addressRows: AddressRowsResult;
  /**
   * The coordinate Smarty returned for each row, keyed by row number, so the
   * eligibility pipeline can reuse it instead of sending the address again.
   */
  readonly geocodes: ReadonlyMap<number, GeocodeResult>;
}

/** One pass over a partner's workbook: where to read it from, and how. */
export interface SpreadsheetValidationRequest {
  /** Where the workbook lives on disk, used to read it. */
  readonly filePath: string;
  readonly mapping: ColumnMapping;
  /** What to call the workbook on the report the partner reads. */
  readonly fileName: string;
  /**
   * Called as validation goes, counted over every data row the sheet holds. A row
   * skipped while reading is decided the moment it is read, so it counts as done
   * before the first address reaches Smarty.
   */
  readonly onProgress?: ProgressReporter;
}

/**
 * Validates every mapped spreadsheet row and reports the rows that need
 * attention. The partner's workbook is only ever read: Smarty's suggested
 * address reaches them as the standardized-address column of the results copy
 * they download, never by overwriting what they typed.
 */
export class SpreadsheetValidationService {
  public constructor(
    private readonly spreadsheet: SpreadsheetReader,
    private readonly validator: AddressValidator,
  ) {}

  public async validate(request: SpreadsheetValidationRequest): Promise<SpreadsheetValidationResult> {
    const { filePath, mapping, fileName, onProgress } = request;
    const addressRows = await this.spreadsheet.readAddressRows(filePath, mapping);
    const { rows, skipped } = addressRows;
    const failures: FailedAddress[] = skipped.map((row) => ({
      rowNumber: row.rowNumber,
      address: "",
      reason: row.reason,
    }));

    const results = await this.validator.validate(
      rows.map((row) => row.address),
      onProgress === undefined ? undefined : (completed) => onProgress(completed + skipped.length),
    );
    const verifications = new Map<number, RowVerification>();
    const geocodes = new Map<number, GeocodeResult>();
    let verified = 0;
    let corrected = 0;
    for (const [index, row] of rows.entries()) {
      const result = results[index];
      if (result === undefined || result.status === "unverified") {
        failures.push({
          rowNumber: row.rowNumber,
          address: formatAddress(row.address),
          reason: result?.messages[0] ?? "Smarty could not verify this address.",
        });
        verifications.set(row.rowNumber, { status: "unverified" });
        continue;
      }
      if (result.location !== undefined) {
        geocodes.set(row.rowNumber, {
          point: { lat: result.location.lat, lng: result.location.lng },
          score: result.location.score,
          matchedAddress: formatAddress(result.normalizedAddress ?? row.address),
          source: "smarty",
        });
      }
      if (result.status === "corrected" && result.normalizedAddress !== undefined) {
        corrected += 1;
        verifications.set(row.rowNumber, {
          status: "corrected",
          standardizedAddress: formatAddress(result.normalizedAddress),
        });
        continue;
      }
      verified += 1;
      verifications.set(row.rowNumber, { status: "verified" });
    }

    failures.sort((left, right) => left.rowNumber - right.rowNumber);
    return {
      report: {
        fileName,
        total: rows.length + skipped.length,
        verified,
        corrected,
        failures,
      },
      verifications,
      addressRows,
      geocodes,
    };
  }
}

function formatAddress(address: Address): string {
  const parts = [address.line1, address.line2, `${address.city}, ${address.state} ${address.postalCode}`];
  return parts.filter((part) => part !== undefined && part.length > 0).join(", ");
}
