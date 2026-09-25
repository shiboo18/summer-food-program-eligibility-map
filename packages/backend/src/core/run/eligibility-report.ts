import type {
  AreaEligibilityResult,
  CheckOutcome,
  EligibilityChecks,
  EligibilityReport,
  EligibilityRowResult,
  LocatedRow,
  LocationConfidence,
  RuralResult,
} from "../../types/eligibility.js";
import type { SkippedRow } from "../../types/spreadsheet.js";
import { GEOCODE_MINIMUM_MATCH_SCORE } from "../../config/constants.js";
import { isTrustedGeocode } from "./geocode-quality.js";
import type { UnlocatedRow } from "./locate-rows.js";

export interface EligibilityReportInput {
  readonly fileName: string;
  readonly located: readonly LocatedRow[];
  readonly unlocated: readonly UnlocatedRow[];
  /** Rows whose address was not verified, so the USDA checks were deliberately not run. */
  readonly unverified: readonly number[];
  /** Rural outcomes keyed by row number. Empty when the rural check was not selected. */
  readonly zone: ReadonlyMap<number, CheckOutcome<RuralResult>>;
  /** Area outcomes keyed by row number. Empty when the area check was not selected. */
  readonly benefit: ReadonlyMap<number, CheckOutcome<AreaEligibilityResult>>;
  /** Rows set aside while reading the sheet, carried through so the partner still sees them. */
  readonly skipped: readonly SkippedRow[];
  readonly checks: EligibilityChecks;
  readonly minimumMatchScore?: number;
}

/**
 * Turns the passes of a run into the report the screen and the export both read.
 *
 * Every row the run touched appears exactly once, whether it was checked, could
 * not be located, or was set aside while reading, so the counts always add up to
 * the sheet. A row whose check failed keeps the location it did resolve and is
 * flagged for verification, rather than being discarded.
 */
export function buildEligibilityReport(input: EligibilityReportInput): EligibilityReport {
  const minimumScore = input.minimumMatchScore ?? GEOCODE_MINIMUM_MATCH_SCORE;
  const results: EligibilityRowResult[] = [
    ...input.located.map((row) => checkedResult(row, input, minimumScore)),
    ...input.unlocated.map((row) => unlocatedResult(row)),
    ...input.unverified.map((rowNumber) => unverifiedResult(rowNumber)),
    ...input.skipped.map((row) => skippedResult(row)),
  ];
  results.sort((left, right) => left.rowNumber - right.rowNumber);

  return {
    fileName: input.fileName,
    total: results.length,
    located: results.filter((result) => result.confidence !== "none").length,
    needingVerification: results.filter((result) => result.needsVerification).length,
    ruralCount: results.filter((result) => result.rural?.designation === "rural").length,
    areaEligibleCount: results.filter(
      (result) => result.area?.eligibility === "eligible" || result.area?.eligibility === "averaged-eligible",
    ).length,
    rows: results,
  };
}

function checkedResult(row: LocatedRow, input: EligibilityReportInput, minimumScore: number): EligibilityRowResult {
  const confidence: LocationConfidence = isTrustedGeocode(row.geocode, minimumScore) ? "high" : "low";
  const messages: string[] = [];
  if (confidence === "low") {
    messages.push("Location is approximate — please verify before relying on the USDA result.");
  }

  const rural = input.checks.rural
    ? valueOf(input.zone.get(row.rowNumber), "USDA rural designation", messages)
    : undefined;
  const area = input.checks.area
    ? valueOf(input.benefit.get(row.rowNumber), "USDA area eligibility", messages)
    : undefined;

  /* A check that was asked for but produced nothing leaves the row unresolved, so
     it is flagged even when the location itself was good. */
  const missingCheck = (input.checks.rural && rural === undefined) || (input.checks.area && area === undefined);

  return {
    rowNumber: row.rowNumber,
    matchedAddress: row.geocode.matchedAddress,
    score: row.geocode.score,
    precision: row.geocode.precision,
    confidence,
    needsVerification: confidence !== "high" || missingCheck,
    rural,
    area,
    messages,
  };
}

/** Reads the value arm, recording why a failed check has no result to show. */
function valueOf<Value>(
  outcome: CheckOutcome<Value> | undefined,
  label: string,
  messages: string[],
): Value | undefined {
  if (outcome === undefined) {
    messages.push(`${label} was not checked.`);
    return undefined;
  }
  if (!outcome.ok) {
    messages.push(`${label} could not be checked: ${outcome.reason}`);
    return undefined;
  }
  return outcome.value;
}

function unlocatedResult(row: UnlocatedRow): EligibilityRowResult {
  const detail = row.reason === undefined ? "" : ` ${row.reason}`;
  return {
    rowNumber: row.rowNumber,
    confidence: "none",
    needsVerification: true,
    messages: [`This address could not be located, so USDA eligibility was not checked.${detail}`],
  };
}

/** A row Smarty could not verify, so no USDA check was attempted for it. */
function unverifiedResult(rowNumber: number): EligibilityRowResult {
  return {
    rowNumber,
    confidence: "none",
    needsVerification: true,
    messages: ["This address could not be verified, so USDA eligibility was not checked."],
  };
}

function skippedResult(row: SkippedRow): EligibilityRowResult {
  return {
    rowNumber: row.rowNumber,
    confidence: "none",
    needsVerification: true,
    messages: [row.reason],
  };
}
