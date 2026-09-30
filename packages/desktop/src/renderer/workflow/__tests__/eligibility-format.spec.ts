import { describe, expect, test } from "vitest";

import type { EligibilityRowResult } from "../../../../../backend/dist/index.js";
import { areaLabel, isReady, locationLabel, readyLabel, ruralLabel, verifyLabel } from "../eligibility-format.js";

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

describe("isReady / readyLabel", () => {
  function result(overrides: Partial<EligibilityRowResult>): EligibilityRowResult {
    return { rowNumber: 1, confidence: "high", needsVerification: false, messages: [], ...overrides };
  }
  const rural = { designation: "rural", matchedCriteria: [] } as const;

  test("ready only when deliverable, confident, rural, and area-eligible", () => {
    const ready = result({ rural, area: { eligibility: "eligible" } });
    expect(isReady(ready, true)).toBe(true);
    expect(readyLabel(ready, true)).toBe("Yes");
  });

  test("averaged-eligible counts as ready when rural", () => {
    expect(isReady(result({ rural, area: { eligibility: "averaged-eligible" } }), true)).toBe(true);
  });

  test("not ready when not rural, undeliverable, unconfident, not-eligible, or unchecked", () => {
    // area-eligible but NOT rural -> not ready
    expect(readyLabel(result({ rural: { designation: "not-rural", matchedCriteria: [] }, area: { eligibility: "eligible" } }), true)).toBe("No");
    expect(readyLabel(result({ rural, area: { eligibility: "eligible" } }), false)).toBe("No");
    expect(readyLabel(result({ needsVerification: true, rural, area: { eligibility: "eligible" } }), true)).toBe("No");
    expect(readyLabel(result({ rural, area: { eligibility: "not-eligible" } }), true)).toBe("No");
    expect(readyLabel(result({}), true)).toBe("No");
  });
});

describe("verifyLabel", () => {
  function result(overrides: Partial<EligibilityRowResult>): EligibilityRowResult {
    return { rowNumber: 1, confidence: "high", needsVerification: false, messages: [], ...overrides };
  }

  test("No when confident, Yes when approximate, — when not located", () => {
    expect(verifyLabel(result({ confidence: "high", needsVerification: false }))).toBe("No");
    expect(verifyLabel(result({ confidence: "low", needsVerification: true }))).toBe("Yes");
    expect(verifyLabel(result({ confidence: "none", needsVerification: true }))).toBe("—");
  });
});
