import { describe, expect, test } from "vitest";

import type { EligibilityRowResult } from "../../../../../backend/dist/index.js";
import { areaLabel, locationLabel, ruralLabel } from "../eligibility-format.js";

describe("ruralLabel", () => {
  test("maps designation to Yes/No and handles missing", () => {
    expect(ruralLabel("rural")).toBe("Yes");
    expect(ruralLabel("not-rural")).toBe("No");
    expect(ruralLabel(undefined)).toBe("—");
  });
});

describe("areaLabel", () => {
  test("maps the 3-state eligibility to zone language", () => {
    expect(areaLabel("eligible")).toBe("In zone");
    expect(areaLabel("averaged-eligible")).toBe("In zone (with approval)");
    expect(areaLabel("not-eligible")).toBe("Out of zone");
    expect(areaLabel("unknown")).toBe("Unknown");
    expect(areaLabel(undefined)).toBe("Unknown");
  });
});

describe("locationLabel", () => {
  function result(overrides: Partial<EligibilityRowResult>): EligibilityRowResult {
    return { rowNumber: 1, confidence: "high", needsVerification: false, messages: [], ...overrides };
  }

  test("reports not-located, verify, and located states", () => {
    expect(locationLabel(result({ confidence: "none", needsVerification: true }))).toBe("Not located");
    expect(locationLabel(result({ confidence: "low", needsVerification: true }))).toBe("Verify location");
    expect(locationLabel(result({ confidence: "high", needsVerification: false }))).toBe("Located");
  });
});
