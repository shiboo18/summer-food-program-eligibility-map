import { describe, expect, test } from "vitest";

import { createPassReporters } from "../phase-progress.js";

function collect(passCount: number, total: number): { reporters: readonly ((n: number) => void)[]; seen: number[] } {
  const seen: number[] = [];
  return { reporters: createPassReporters(passCount, total, (completed) => seen.push(completed)), seen };
}

describe("createPassReporters", () => {
  test("passes a single pass straight through", () => {
    const { reporters, seen } = collect(1, 10);

    reporters[0]?.(4);
    reporters[0]?.(10);

    expect(seen).toEqual([4, 10]);
  });

  test("gives each pass an equal slice, so the phase advances once", () => {
    const { reporters, seen } = collect(3, 30);

    reporters[0]?.(30);
    reporters[1]?.(30);
    reporters[2]?.(30);

    expect(seen).toEqual([10, 20, 30]);
  });

  test("reports within a pass's own slice", () => {
    const { reporters, seen } = collect(2, 100);

    reporters[0]?.(50);
    reporters[1]?.(50);

    expect(seen).toEqual([25, 75]);
  });

  test("never goes backwards or past the total across passes in order", () => {
    const { reporters, seen } = collect(3, 9);

    for (const reporter of reporters) {
      for (const completed of [3, 6, 9]) {
        reporter(completed);
      }
    }

    expect(seen).toEqual([...seen].sort((left, right) => left - right));
    expect(Math.max(...seen)).toBe(9);
  });

  test("holds a count outside the pass's total to the slice's ends", () => {
    const { reporters, seen } = collect(2, 10);

    reporters[0]?.(-5);
    reporters[0]?.(50);

    expect(seen).toEqual([0, 5]);
  });

  test("treats a phase with no rows as finished", () => {
    const { reporters, seen } = collect(2, 0);

    reporters[0]?.(0);

    expect(seen).toEqual([0]);
  });

  test("makes at least one reporter", () => {
    expect(createPassReporters(0, 10, () => undefined)).toHaveLength(1);
  });
});
