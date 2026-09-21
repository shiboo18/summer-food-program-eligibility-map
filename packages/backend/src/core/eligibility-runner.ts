import type { Geocoder, RuralChecker, AreaEligibilityChecker } from "../contracts.js";
import type {
  EligibilityChecks,
  EligibilityReport,
  EligibilityRowResult,
  GeocodeResult,
  LocationConfidence,
} from "../types/eligibility.js";
import type { AddressRow, SkippedRow } from "../types/spreadsheet.js";
import { GEOCODE_CONFIDENCE_THRESHOLD } from "../config/constants.js";

/**
 * Runs the USDA eligibility pipeline over a spreadsheet's mapped rows: geocode
 * each address, gate on the match score, then run the selected rural and area
 * checks against the located coordinate. Rows that cannot be located, or whose
 * coordinate is too approximate, are flagged for verification. Rows skipped
 * during reading (incomplete addresses) are reported too, so the total matches
 * the spreadsheet.
 */
export class EligibilityRunner {
  public constructor(
    private readonly geocoder: Geocoder,
    private readonly ruralChecker: RuralChecker,
    private readonly areaChecker: AreaEligibilityChecker,
    private readonly confidenceThreshold: number = GEOCODE_CONFIDENCE_THRESHOLD,
  ) {}

  public async run(
    rows: readonly AddressRow[],
    checks: EligibilityChecks,
    fileName: string,
    skipped: readonly SkippedRow[] = [],
  ): Promise<EligibilityReport> {
    const results: EligibilityRowResult[] = [];
    for (const row of rows) {
      results.push(await this.runRow(row, checks));
    }
    for (const row of skipped) {
      results.push({
        rowNumber: row.rowNumber,
        confidence: "none",
        needsVerification: true,
        messages: [row.reason],
      });
    }
    results.sort((left, right) => left.rowNumber - right.rowNumber);

    return {
      fileName,
      total: rows.length + skipped.length,
      located: results.filter((result) => result.confidence !== "none").length,
      needingVerification: results.filter((result) => result.needsVerification).length,
      ruralCount: results.filter((result) => result.rural?.designation === "rural").length,
      areaEligibleCount: results.filter(
        (result) =>
          result.area?.eligibility === "eligible" || result.area?.eligibility === "averaged-eligible",
      ).length,
      rows: results,
    };
  }

  private async runRow(row: AddressRow, checks: EligibilityChecks): Promise<EligibilityRowResult> {
    const geocode = await this.geocoder.geocode(row.address);
    if (geocode === undefined) {
      return {
        rowNumber: row.rowNumber,
        confidence: "none",
        needsVerification: true,
        messages: ["This address could not be located, so USDA eligibility was not checked."],
      };
    }

    const confidence = this.confidenceFor(geocode);
    const messages: string[] = [];
    if (confidence === "low") {
      messages.push("Location is approximate — please verify before relying on the USDA result.");
    }

    return {
      rowNumber: row.rowNumber,
      matchedAddress: geocode.matchedAddress,
      score: geocode.score,
      confidence,
      needsVerification: confidence !== "high",
      rural: checks.rural ? await this.ruralChecker.check(geocode.point) : undefined,
      area: checks.area ? await this.areaChecker.check(geocode.point) : undefined,
      messages,
    };
  }

  private confidenceFor(geocode: GeocodeResult): LocationConfidence {
    return geocode.score >= this.confidenceThreshold ? "high" : "low";
  }
}
