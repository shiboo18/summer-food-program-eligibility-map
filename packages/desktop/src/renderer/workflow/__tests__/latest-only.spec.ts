import { describe, expect, test, vi } from "vitest";

import { latestOnly } from "../latest-only.js";

/** A promise the test settles by hand, so call order and finish order can differ. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("latestOnly", () => {
  test("delivers each result when calls do not overlap", async () => {
    const deliver = vi.fn();
    const answers = ["first", "second"];
    const run = latestOnly(async () => answers.shift(), deliver);

    await run();
    await run();

    expect(deliver.mock.calls).toEqual([["first"], ["second"]]);
  });

  test("drops an earlier call that finishes after a later one", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const pending = [slow, fast];
    const deliver = vi.fn();
    const run = latestOnly(async () => (pending.shift() ?? fast).promise, deliver);

    const earlier = run();
    const later = run();
    fast.resolve("new key");
    await later;
    slow.resolve("old key");
    await earlier;

    expect(deliver.mock.calls).toEqual([["new key"]]);
  });

  test("passes its arguments through to the action", async () => {
    const action = vi.fn(async (a: number, b: string) => `${a}${b}`);
    const deliver = vi.fn();
    const run = latestOnly(action, deliver);

    await run(1, "x");

    expect(action).toHaveBeenCalledWith(1, "x");
    expect(deliver).toHaveBeenCalledWith("1x");
  });

  test("rejects when the latest call fails, delivering nothing", async () => {
    const deliver = vi.fn();
    const run = latestOnly(async () => {
      throw new Error("bridge failed");
    }, deliver);

    await expect(run()).rejects.toThrow("bridge failed");
    expect(deliver).not.toHaveBeenCalled();
  });

  test("ignores a failure from a call that has been overtaken", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const pending = [slow, fast];
    const deliver = vi.fn();
    const run = latestOnly(async () => (pending.shift() ?? fast).promise, deliver);

    const earlier = run();
    const later = run();
    fast.resolve("new key");
    await later;
    slow.reject(new Error("old check failed"));

    await expect(earlier).resolves.toBeUndefined();
    expect(deliver.mock.calls).toEqual([["new key"]]);
  });
});
