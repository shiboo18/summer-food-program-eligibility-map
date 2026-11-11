import { describe, expect, test } from "vitest";

import { resultColumnsFor } from "../eligibility-checks.js";

const addressColumns = ["Standardized Address", "Address Checks", "Address Match Level"];

describe("resultColumnsFor", () => {
  test.each([
    { checks: { rural: false, area: false }, headers: addressColumns },
    { checks: { rural: true, area: false }, headers: [...addressColumns, "USDA Rural"] },
    { checks: { rural: false, area: true }, headers: [...addressColumns, "USDA Eligibility"] },
    { checks: { rural: true, area: true }, headers: [...addressColumns, "USDA Rural", "USDA Eligibility"] },
  ])("when rural is $checks.rural and area is $checks.area, appends $headers.length columns in order", ({ checks, headers }) => {
    const result = resultColumnsFor(checks);

    expect(result).toEqual(headers);
  });
});
