import { describe, expect, test } from "vitest";

import {
  canRunChecks,
  resolveCheckControls,
  selectedEligibilityChecks,
  type EligibilityCheckSelection,
} from "../eligibility-checks.js";

const all: EligibilityCheckSelection = { addressValidation: true, rural: true, area: true };
const addressOff: EligibilityCheckSelection = { addressValidation: false, rural: true, area: true };

describe("resolveCheckControls", () => {
  test("enables the USDA checkboxes only when address validation is selected", () => {
    expect(resolveCheckControls(all)).toEqual({ ruralEnabled: true, areaEnabled: true });
    expect(resolveCheckControls(addressOff)).toEqual({ ruralEnabled: false, areaEnabled: false });
  });
});

describe("selectedEligibilityChecks", () => {
  test("passes through the chosen checks when address validation is on", () => {
    expect(selectedEligibilityChecks({ addressValidation: true, rural: true, area: false })).toEqual({
      rural: true,
      area: false,
    });
  });

  test("forces the USDA checks off when address validation is off", () => {
    expect(selectedEligibilityChecks(addressOff)).toEqual({ rural: false, area: false });
  });
});

describe("canRunChecks", () => {
  test("requires address validation; USDA checks are optional", () => {
    expect(canRunChecks(all)).toBe(true);
    expect(canRunChecks({ addressValidation: true, rural: false, area: true })).toBe(true);
    expect(canRunChecks({ addressValidation: true, rural: false, area: false })).toBe(true);
    expect(canRunChecks(addressOff)).toBe(false);
  });
});
