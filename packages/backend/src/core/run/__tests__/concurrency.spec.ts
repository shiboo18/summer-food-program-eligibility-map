import { describe, expect, test, vi } from "vitest";

import { mapWithConcurrency } from "../concurrency.js";

/** Resolves after `ms`, so completion order can be made to differ from input order. */
function after<Value>(ms: number, value: Value): Promise<Value> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe("mapWithConcurrency", () => {
  test("returns outcomes in input order however they finish", async () => {
    const outcomes = await mapWithConcurrency([30, 10, 20], 3, async (ms) => after(ms, `done ${String(ms)}`));

    expect(outcomes).toEqual([
      { ok: true, value: "done 30" },
      { ok: true, value: "done 10" },
      { ok: true, value: "done 20" },
    ]);
  });

  test("captures a failure as an outcome and still runs every other item", async () => {
    const work = vi.fn(async (item: number) => {
      if (item === 2) {
        throw new Error("layer unavailable");
      }
      return item * 10;
    });

    const outcomes = await mapWithConcurrency([1, 2, 3], 2, work);

    expect(outcomes).toEqual([
      { ok: true, value: 10 },
      { ok: false, reason: "layer unavailable" },
      { ok: true, value: 30 },
    ]);
    expect(work).toHaveBeenCalledTimes(3);
  });

  test("describes a thrown non-error", async () => {
    const outcomes = await mapWithConcurrency([1], 1, async () => {
      throw "just a string";
    });

    expect(outcomes).toEqual([{ ok: false, reason: "just a string" }]);
  });

  test("never exceeds the limit in flight", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 20 }, (_unused, index) => index), 6, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await after(5, undefined);
      inFlight -= 1;
    });

    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1);
  });

  test("counts progress once per item, failures included", async () => {
    const reported: number[] = [];

    await mapWithConcurrency(
      [1, 2, 3],
      1,
      async (item) => {
        if (item === 2) {
          throw new Error("nope");
        }
        return item;
      },
      (completed) => reported.push(completed),
    );

    expect(reported).toEqual([1, 2, 3]);
  });

  test("handles an empty list without calling the work or the reporter", async () => {
    const work = vi.fn(async (item: number) => item);
    const onProgress = vi.fn();

    await expect(mapWithConcurrency([], 6, work, onProgress)).resolves.toEqual([]);
    expect(work).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  test("handles a single item and a limit larger than the list", async () => {
    await expect(mapWithConcurrency([5], 6, async (item) => item * 2)).resolves.toEqual([
      { ok: true, value: 10 },
    ]);
  });

  test("treats a limit below one as one", async () => {
    await expect(mapWithConcurrency([1, 2], 0, async (item) => item)).resolves.toEqual([
      { ok: true, value: 1 },
      { ok: true, value: 2 },
    ]);
  });
});
