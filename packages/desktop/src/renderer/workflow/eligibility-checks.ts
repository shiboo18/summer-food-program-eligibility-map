import type { EligibilityChecks } from "../../../../backend/dist/index.js";

/** The state of the four checkboxes on the Checks step. */
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
 * The USDA checks depend on the geocode from address validation, so the rural
 * and area checkboxes stay disabled until address validation is selected.
 */
export function resolveCheckControls(selection: EligibilityCheckSelection): CheckControlState {
  return { ruralEnabled: selection.addressValidation, areaEnabled: selection.addressValidation };
}

/**
 * The USDA checks to run. When address validation is off, no USDA check can
 * run because there is no coordinate to check against.
 */
export function selectedEligibilityChecks(selection: EligibilityCheckSelection): EligibilityChecks {
  if (!selection.addressValidation) {
    return { rural: false, area: false };
  }
  return { rural: selection.rural, area: selection.area };
}

/** A run needs address validation; the USDA checks are optional add-ons. */
export function canRunChecks(selection: EligibilityCheckSelection): boolean {
  return selection.addressValidation;
}
