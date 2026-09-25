import { describe, expect, test } from "vitest";

import {
  activeRunPhases,
  runPhaseCopy,
  runPhases,
  runPhaseSteps,
  runProgressView,
} from "../run-progress.js";

const all = ["verifying", "rural", "area"] as const;

describe("activeRunPhases", () => {
  test("always verifies, and adds each USDA phase only when its check is selected", () => {
    expect(activeRunPhases({ rural: true, area: true })).toEqual(["verifying", "rural", "area"]);
    expect(activeRunPhases({ rural: true, area: false })).toEqual(["verifying", "rural"]);
    expect(activeRunPhases({ rural: false, area: true })).toEqual(["verifying", "area"]);
    expect(activeRunPhases({ rural: false, area: false })).toEqual(["verifying"]);
  });
});

describe("runProgressView", () => {
  test("shares the bar over the three active phases", () => {
    expect(runProgressView({ phase: "verifying", completed: 240, total: 480 }, all).percent).toBe(17);
    expect(runProgressView({ phase: "rural", completed: 240, total: 480 }, all).percent).toBe(50);
    expect(runProgressView({ phase: "area", completed: 480, total: 480 }, all).percent).toBe(100);
  });

  test("fills the whole bar for a verify-only run", () => {
    expect(runProgressView({ phase: "verifying", completed: 240, total: 480 }, ["verifying"]).percent).toBe(50);
    expect(runProgressView({ phase: "verifying", completed: 480, total: 480 }, ["verifying"]).percent).toBe(100);
  });

  test("splits the bar in half when one USDA phase runs", () => {
    const active = ["verifying", "rural"] as const;
    expect(runProgressView({ phase: "verifying", completed: 480, total: 480 }, active).percent).toBe(50);
    expect(runProgressView({ phase: "rural", completed: 240, total: 480 }, active).percent).toBe(75);
  });

  test("counts a phase with no rows to get through as finished", () => {
    expect(runProgressView({ phase: "verifying", completed: 0, total: 0 }, all).percent).toBe(33);
  });

  test("holds a report to its phase's share, so the bar cannot overrun or reverse", () => {
    expect(runProgressView({ phase: "rural", completed: 600, total: 480 }, all).percent).toBe(67);
    expect(runProgressView({ phase: "rural", completed: -5, total: 480 }, all).percent).toBe(33);
  });

  test("reads the count in the phase's own verb, singular for one address", () => {
    expect(runProgressView({ phase: "verifying", completed: 1, total: 3 }, all).label).toBe(
      "1 of 3 addresses verified",
    );
    expect(runProgressView({ phase: "area", completed: 1, total: 1 }, all).label).toBe("1 of 1 address checked");
  });
});

describe("runPhaseSteps", () => {
  test("marks earlier phases done, the current one running, and later ones pending", () => {
    expect(runPhaseSteps(all, "rural").map((step) => [step.label, step.state])).toEqual([
      ["Address Verification", "done"],
      ["USDA Rural", "running"],
      ["USDA Eligibility", "pending"],
    ]);
  });

  test("marks a phase this run skips as off", () => {
    expect(runPhaseSteps(["verifying", "area"], "verifying").map((step) => [step.label, step.state])).toEqual([
      ["Address Verification", "running"],
      ["USDA Rural", "off"],
      ["USDA Eligibility", "pending"],
    ]);
  });
});

describe("runPhaseCopy", () => {
  test("names Smarty while verifying", () => {
    expect(runPhaseCopy("verifying")).toEqual({
      detail: "Checking each address against USPS records with Smarty",
      privacy: "Only addresses are sent to Smarty — nothing else leaves this computer",
    });
  });

  test("names the public maps for each USDA phase", () => {
    expect(runPhaseCopy("rural").detail).toBe("Looking up each address on the public USDA rural map");
    expect(runPhaseCopy("area").detail).toBe("Looking up each address on the public USDA area-eligibility map");
    expect(runPhaseCopy("rural").privacy).toContain("USDA and ArcGIS");
  });

  test("covers every phase, so none can leave the screen blank", () => {
    expect(runPhases.map((phase) => runPhaseCopy(phase).detail)).toEqual([
      "Checking each address against USPS records with Smarty",
      "Looking up each address on the public USDA rural map",
      "Looking up each address on the public USDA area-eligibility map",
    ]);
  });
});
