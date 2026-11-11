import { describe, expect, test } from "vitest";

import {
  canRunChecks,
  resolveCheckControls,
  resultColumnsFor,
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

describe("resultColumnsFor", () => {
  const columns = {
    standardized: "Standardized Address",
    deliverability: "Address Checks",
    location: "Address Match Level",
    rural: "USDA Rural",
    area: "USDA Eligibility",
  };
  const addressColumns = ["Standardized Address", "Address Checks", "Address Match Level"];

  test.each([
    { checks: { rural: false, area: false }, headers: addressColumns },
    { checks: { rural: true, area: false }, headers: [...addressColumns, "USDA Rural"] },
    { checks: { rural: false, area: true }, headers: [...addressColumns, "USDA Eligibility"] },
    { checks: { rural: true, area: true }, headers: [...addressColumns, "USDA Rural", "USDA Eligibility"] },
  ])("when rural is $checks.rural and area is $checks.area, appends $headers.length columns in order", ({ checks, headers }) => {
    const result = resultColumnsFor(columns, checks);

    expect(result).toEqual(headers);
  });

  test("when the names differ, uses the names it is given", () => {
    const renamed = { standardized: "S", deliverability: "D", location: "L", rural: "R", area: "A" };

    const result = resultColumnsFor(renamed, { rural: false, area: true });

    expect(result).toEqual(["S", "D", "L", "A"]);
  });
});
