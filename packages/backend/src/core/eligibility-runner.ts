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
 * Runs the USDA eligibility pipeline over a spreadsheet's mapped rows: reuse the
 * Smarty coordinate found during address validation (passed in as a seed),
 * falling back to the geocoder only when Smarty had no or a low-confidence
 * coordinate, then run the selected rural and area checks. Rows that cannot be
 * located, are too approximate, error out, or were skipped while reading are all
 * flagged for verification so the batch always completes.
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
    seedGeocodes: ReadonlyMap<number, GeocodeResult> = new Map(),
  ): Promise<EligibilityReport> {
    const results: EligibilityRowResult[] = [];
    for (const row of rows) {
      try {
        results.push(await this.runRow(row, checks, seedGeocodes.get(row.rowNumber)));
      } catch (error: unknown) {
        // One flaky row must not abort the whole batch.
        results.push({
          rowNumber: row.rowNumber,
          confidence: "none",
          needsVerification: true,
          messages: [`USDA eligibility could not be checked: ${errorMessage(error)}`],
        });
      }
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

  private async runRow(
    row: AddressRow,
    checks: EligibilityChecks,
    seed: GeocodeResult | undefined,
  ): Promise<EligibilityRowResult> {
    const geocode = await this.resolveGeocode(row, seed);
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

  /**
   * Prefer the Smarty seed when it is high confidence; otherwise consult the
   * fallback geocoder and keep whichever coordinate scores higher. This reuses
   * Smarty's already-fetched coordinate and only calls the geocoder when Smarty
   * was missing or coarse.
   */
  private async resolveGeocode(row: AddressRow, seed: GeocodeResult | undefined): Promise<GeocodeResult | undefined> {
    if (seed !== undefined && seed.score >= this.confidenceThreshold) {
      return seed;
    }
    const fallback = await this.geocoder.geocode(row.address);
    if (fallback === undefined) {
      return seed;
    }
    if (seed === undefined) {
      return fallback;
    }
    return fallback.score > seed.score ? fallback : seed;
  }

  private confidenceFor(geocode: GeocodeResult): LocationConfidence {
    return geocode.score >= this.confidenceThreshold ? "high" : "low";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
