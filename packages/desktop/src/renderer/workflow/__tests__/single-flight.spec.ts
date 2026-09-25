import { describe, expect, test, vi } from "vitest";

import { singleFlight } from "../single-flight.js";

/** An action whose every call stays pending until the returned `finish` is called. */
function deferredAction() {
  const pending: Array<() => void> = [];
  const action = vi.fn(
    async (): Promise<void> =>
      new Promise<void>((resolve) => {
        pending.push(resolve);
      }),
  );
  return {
    action,
    finish: (): void => {
      for (const resolve of pending.splice(0)) {
        resolve();
      }
    },
  };
}

describe("singleFlight", () => {
  test("ignores a second call made while the first is still running", async () => {
    const { action, finish } = deferredAction();
    const guarded = singleFlight(action);

    const first = guarded();
    const second = guarded();
    finish();
    await Promise.all([first, second]);

    expect(action).toHaveBeenCalledTimes(1);
  });

  test("runs again once the first call has finished", async () => {
    const { action, finish } = deferredAction();
    const guarded = singleFlight(action);

    const first = guarded();
    finish();
    await first;
    const second = guarded();
    finish();
    await second;

    expect(action).toHaveBeenCalledTimes(2);
  });

  test("passes every argument through to the action", async () => {
    const action = vi.fn(async (): Promise<void> => undefined);

    await singleFlight(action as (skip: boolean, reason: string) => Promise<void>)(true, "rail");

    expect(action).toHaveBeenCalledWith(true, "rail");
  });

  test("releases the guard when the action rejects, and reports the failure", async () => {
    const action = vi.fn(async (): Promise<void> => {
      throw new Error("checks failed");
    });
    const guarded = singleFlight(action);

    await expect(guarded()).rejects.toThrow("checks failed");
    await expect(guarded()).rejects.toThrow("checks failed");

    expect(action).toHaveBeenCalledTimes(2);
  });
});
