import type { AddressValidator, SpreadsheetReader } from "../contracts.js";
import type { RowVerification, ValidationReport } from "../types/address.js";
import type { ValidatedLocation } from "../types/eligibility.js";
import type { ProgressReporter } from "../types/progress.js";
import type { AddressRowsResult, ColumnMapping } from "../types/spreadsheet.js";
import { formatAddress } from "./address-shape.js";

/** A validation report plus what each row's location pass can reuse, keyed by row number. */
export interface SpreadsheetValidationResult {
  readonly report: ValidationReport;
  readonly locations: ReadonlyMap<number, ValidatedLocation>;
  /** Per-row verification outcome, keyed by row number, for the results annotation. */
  readonly verifications: ReadonlyMap<number, RowVerification>;
  /** The parsed rows, so the eligibility pass need not read the file again. */
  readonly addressRows: AddressRowsResult;
}

/** One pass over a partner's workbook: where to read it from, and how. */
export interface SpreadsheetValidationRequest {
  readonly filePath: string;
  readonly mapping: ColumnMapping;
  /**
   * Called as validation goes, counted over every data row in the sheet. Rows
   * skipped while reading count as done before the first address reaches Smarty.
   */
  readonly onProgress?: ProgressReporter;
}

/**
 * Validates every mapped spreadsheet row and reports the rows that need
 * attention. The workbook is only read: Smarty's suggested address reaches the
 * partner as a column in the results copy, never by overwriting what they typed.
 * Also returns each row's Smarty coordinate so the eligibility pass need not ask
 * Smarty again.
 */
export class SpreadsheetValidationService {
  public constructor(
    private readonly spreadsheet: SpreadsheetReader,
    private readonly validator: AddressValidator,
  ) {}

  public async validate(request: SpreadsheetValidationRequest): Promise<SpreadsheetValidationResult> {
    const { filePath, mapping, onProgress } = request;
    const addressRows = await this.spreadsheet.readAddressRows(filePath, mapping);
    const { rows, skipped } = addressRows;

    const results = await this.validator.validate(
      rows.map((row) => row.address),
      onProgress === undefined ? undefined : (completed) => onProgress(completed + skipped.length),
    );
    const locations = new Map<number, ValidatedLocation>();
    const verifications = new Map<number, RowVerification>();
    let verified = 0;
    let corrected = 0;
    let failed = skipped.length;
    for (const [index, row] of rows.entries()) {
      const result = results[index];
      if (result.status === "unverified") {
        failed += 1;
        verifications.set(row.rowNumber, { status: "unverified" });
        continue;
      }
      if (result.location !== undefined) {
        locations.set(row.rowNumber, {
          geocode: {
            point: { lat: result.location.lat, lng: result.location.lng },
            score: result.location.score,
            precision: result.location.precision,
          },
          /* So the geocoder looks up the corrected address, not what the partner typed. */
          ...(result.normalizedAddress === undefined ? {} : { standardizedAddress: result.normalizedAddress }),
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

    return {
      report: { verified, corrected, failed },
      locations,
      verifications,
      addressRows,
    };
  }
}
