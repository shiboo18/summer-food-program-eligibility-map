import type { RowVerification } from "../types/address.js";
import type { AreaEligibility, EligibilityChecks, EligibilityRowResult } from "../types/eligibility.js";
import type { AreaLabel, DeliverabilityLabel, ReadyLabel, ResultAnnotation, RuralLabel } from "../types/spreadsheet.js";

const areaLabels: Record<AreaEligibility, AreaLabel> = {
  eligible: "In Area — Eligible",
  "averaged-eligible": "In Area — Averaged",
  "not-eligible": "Not Eligible",
  unknown: "Not Verified",
};

/** The USDA checks that ran and their per-row results, keyed by row number. */
export interface EligibilityAnnotationInput {
  readonly checks: EligibilityChecks;
  readonly rows: ReadonlyMap<number, EligibilityRowResult>;
}

/**
 * Builds one row's sponsor-readable result annotation from its Smarty
 * verification and, when the USDA checks ran, its eligibility result.
 *
 * Rural and area read "Not Verified" when the row was undeliverable or its
 * location was too approximate to trust, so a blank never passes for a real
 * verdict. Ready to Ship is "Yes" only when the address is deliverable, the
 * location is trusted, the address is rural, and it sits in an eligible area.
 */
export function toResultAnnotation(
  rowNumber: number,
  verification: RowVerification,
  eligibility?: EligibilityAnnotationInput,
): ResultAnnotation {
  const deliverability: DeliverabilityLabel =
    verification.status === "corrected"
      ? "Valid and corrected"
      : verification.status === "verified"
        ? "Valid"
        : "Invalid";
  const base: ResultAnnotation = {
    rowNumber,
    deliverability,
    ...(verification.status === "corrected" && verification.standardizedAddress !== undefined
      ? { standardizedAddress: verification.standardizedAddress }
      : {}),
  };
  if (eligibility === undefined || (!eligibility.checks.rural && !eligibility.checks.area)) {
    return base;
  }

  const result = eligibility.rows.get(rowNumber);
  const trusted = deliverability !== "Invalid" && result !== undefined && !result.needsVerification;

  const rural: RuralLabel | undefined = eligibility.checks.rural
    ? trusted && result.rural !== undefined
      ? result.rural.designation === "rural"
        ? "Rural"
        : "Not Rural"
      : "Not Verified"
    : undefined;

  const area: AreaLabel | undefined = eligibility.checks.area
    ? trusted && result.area !== undefined
      ? areaLabels[result.area.eligibility]
      : "Not Verified"
    : undefined;

  const areaEligible = area === "In Area — Eligible" || area === "In Area — Averaged";
  const ready: ReadyLabel = trusted && rural === "Rural" && areaEligible ? "Yes" : "No";

  return {
    ...base,
    ...(rural !== undefined ? { rural } : {}),
    ...(area !== undefined ? { area } : {}),
    ready,
  };
}

/** One annotation per verified row, in row order. */
export function toResultAnnotations(
  verifications: ReadonlyMap<number, RowVerification>,
  eligibility?: EligibilityAnnotationInput,
): readonly ResultAnnotation[] {
  return [...verifications.entries()]
    .sort(([left], [right]) => left - right)
    .map(([rowNumber, verification]) => toResultAnnotation(rowNumber, verification, eligibility));
}
