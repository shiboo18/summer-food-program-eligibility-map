import { RESULT_COLUMNS } from "../config/constants.js";
import type { EligibilityChecks } from "../types/eligibility.js";

/** Return the headers an export appends, in order: the address columns, then one per USDA check that ran. */
export function resultColumnsFor(checks: EligibilityChecks): readonly string[] {
  return [
    RESULT_COLUMNS.standardized,
    RESULT_COLUMNS.deliverability,
    RESULT_COLUMNS.location,
    ...(checks.rural ? [RESULT_COLUMNS.rural] : []),
    ...(checks.area ? [RESULT_COLUMNS.area] : []),
  ];
}
