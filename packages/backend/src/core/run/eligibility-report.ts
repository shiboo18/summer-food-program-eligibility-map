import type {
  AreaEligibilityResult,
  EligibilityReport,
  EligibilityRowResult,
  LocatedRow,
  RuralResult,
} from "../../types/eligibility.js";

export interface EligibilityReportInput {
  readonly located: readonly LocatedRow[];
  /** Rows with no result: unlocated, unverified, or set aside while reading the sheet. */
  readonly unchecked: readonly number[];
  /** Rural results keyed by row number. Empty when the rural check was not selected. */
  readonly zone: ReadonlyMap<number, RuralResult | undefined>;
  /** Area results keyed by row number. Empty when the area check was not selected. */
  readonly benefit: ReadonlyMap<number, AreaEligibilityResult | undefined>;
}

/**
 * Build the report the screen and the export read from a run's passes. Every
 * row appears exactly once, so the counts add up to the sheet.
 */
export function buildEligibilityReport(input: EligibilityReportInput): EligibilityReport {
  const results: EligibilityRowResult[] = [
    ...input.located.map((row) => ({
      rowNumber: row.rowNumber,
      precision: row.geocode.precision,
      rural: input.zone.get(row.rowNumber),
      area: input.benefit.get(row.rowNumber),
    })),
    ...input.unchecked.map((rowNumber) => ({ rowNumber })),
  ];
  results.sort((left, right) => left.rowNumber - right.rowNumber);

  return {
    total: results.length,
    ruralCount: results.filter((result) => result.rural?.designation === "rural").length,
    areaEligibleCount: results.filter(
      (result) => result.area?.eligibility === "eligible" || result.area?.eligibility === "averaged-eligible",
    ).length,
    rows: results,
  };
}
