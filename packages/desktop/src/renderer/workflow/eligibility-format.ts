import type { AreaEligibility, EligibilityRowResult, RuralDesignation } from "../../../../backend/dist/index.js";

/** Column label for a rural designation. */
export function ruralLabel(designation: RuralDesignation | undefined): string {
  if (designation === undefined) {
    return "—";
  }
  return designation === "rural" ? "Yes" : "No";
}

/**
 * Column label for the 3-state area eligibility, using the map's zone language.
 * "Averaged Eligible" (blue) is conditional — eligible only with State agency +
 * FNS approval — so it reads "In zone (with approval)".
 */
export function areaLabel(eligibility: AreaEligibility | undefined): string {
  switch (eligibility) {
    case "eligible":
      return "In zone";
    case "averaged-eligible":
      return "In zone (with approval)";
    case "not-eligible":
      return "Out of zone";
    default:
      return "Unknown";
  }
}

/** Short per-row status shown in the results table. */
export function locationLabel(result: EligibilityRowResult): string {
  if (result.confidence === "none") {
    return "Not located";
  }
  return result.needsVerification ? "Verify location" : "Located";
}
