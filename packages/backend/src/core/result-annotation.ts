import type { AddressVerificationStatus, RowVerification } from "../types/address.js";
import type {
  AreaEligibility,
  EligibilityChecks,
  EligibilityRowResult,
  LocationPrecision,
  RuralDesignation,
} from "../types/eligibility.js";
import type { AreaLabel, DeliverabilityLabel, LocationLabel, ResultAnnotation, RuralLabel } from "../types/spreadsheet.js";
import { isTrustedPrecision } from "./run/geocode-quality.js";

const deliverabilityLabels: Record<AddressVerificationStatus, DeliverabilityLabel> = {
  verified: "Valid",
  corrected: "Valid and corrected",
  unverified: "Invalid",
};

const locationLabels: Record<LocationPrecision, LocationLabel> = {
  rooftop: "Exact address",
  street: "Street level",
  postal: "ZIP area",
  locality: "Town area",
  unknown: "Not located",
};

const areaLabels: Record<AreaEligibility, AreaLabel> = {
  eligible: "In Area — Eligible",
  "averaged-eligible": "In Area — Averaged",
  "not-eligible": "Not Eligible",
  unknown: "Not Verified",
};

const areaLabelsApproximate: Record<AreaEligibility, AreaLabel> = {
  eligible: "In Area — Eligible (approximate location)",
  "averaged-eligible": "In Area — Averaged (approximate location)",
  "not-eligible": "Not Eligible (approximate location)",
  unknown: "Not Verified",
};

const ruralLabels: Record<RuralDesignation, RuralLabel> = {
  rural: "Rural",
  "not-rural": "Not Rural",
};

const ruralLabelsApproximate: Record<RuralDesignation, RuralLabel> = {
  rural: "Rural (approximate location)",
  "not-rural": "Not Rural (approximate location)",
};

/**
 * Builds one row's sponsor-readable result annotation from its Smarty
 * verification and (when the checks ran) its eligibility result.
 *
 * The Location column carries how precisely the row was placed. When that
 * placement is too coarse to trust which block group the point fell in, the
 * rural and area verdicts are hedged with "(approximate location)", so the
 * caveat rides on the verdict itself rather than only in the Location column.
 * Rural/area read "Not Verified" only when the address was not deliverable or
 * the check produced no result.
 */
export function toResultAnnotation(
  rowNumber: number,
  verification: RowVerification,
  checks: EligibilityChecks,
  eligibility: EligibilityRowResult | undefined,
): ResultAnnotation {
  const deliverable = verification.status === "verified" || verification.status === "corrected";
  const hasResult = deliverable && eligibility !== undefined;
  const precision = eligibility?.precision ?? "unknown";
  const trusted = isTrustedPrecision(precision);

  const rural: RuralLabel | undefined = checks.rural
    ? hasResult && eligibility?.rural !== undefined
      ? (trusted ? ruralLabels : ruralLabelsApproximate)[eligibility.rural.designation]
      : "Not Verified"
    : undefined;

  const area: AreaLabel | undefined = checks.area
    ? hasResult && eligibility?.area !== undefined
      ? (trusted ? areaLabels : areaLabelsApproximate)[eligibility.area.eligibility]
      : "Not Verified"
    : undefined;

  return {
    rowNumber,
    deliverability: deliverabilityLabels[verification.status],
    location: locationLabels[precision],
    ...(verification.standardizedAddress !== undefined
      ? { standardizedAddress: verification.standardizedAddress }
      : {}),
    ...(rural !== undefined ? { rural } : {}),
    ...(area !== undefined ? { area } : {}),
  };
}
