import type { EligibilityChecks } from "../types/eligibility.js";

/** The state of the checkboxes on the Checks step. */
export interface EligibilityCheckSelection {
  /** Address validation is required — it produces the geocode the USDA checks need. */
  readonly addressValidation: boolean;
  readonly rural: boolean;
  readonly area: boolean;
}

/** Whether each dependent checkbox may be toggled, given the current selection. */
export interface CheckControlState {
  readonly ruralEnabled: boolean;
  readonly areaEnabled: boolean;
}

/**
 * Return which dependent checkboxes may be toggled. The USDA checks need the
 * geocode from address validation, so they stay disabled until it is selected.
 */
export function resolveCheckControls(selection: EligibilityCheckSelection): CheckControlState {
  return { ruralEnabled: selection.addressValidation, areaEnabled: selection.addressValidation };
}

/** Return the USDA checks to run: none without address validation, since there is no coordinate. */
export function selectedEligibilityChecks(selection: EligibilityCheckSelection): EligibilityChecks {
  if (!selection.addressValidation) {
    return { rural: false, area: false };
  }
  return { rural: selection.rural, area: selection.area };
}

/** Return whether a run can start. It needs address validation; the USDA checks are optional. */
export function canRunChecks(selection: EligibilityCheckSelection): boolean {
  return selection.addressValidation;
}
