import { describe, expect, test, vi } from "vitest";

import { createBackgroundQueue, type BackgroundQueue } from "../background-queue.js";

/** A promise the test settles itself, so overlapping work is observable. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Resolve once everything queued so far has run, by queueing a marker behind it. */
function settled(queue: BackgroundQueue): Promise<void> {
  const done = deferred();
  queue.enqueue(async () => done.resolve());
  return done.promise;
}

describe("createBackgroundQueue", () => {
  test("returns before the work it was given has finished", () => {
    const pending = deferred();
    let finished = false;
    const queue = createBackgroundQueue(() => {});

    queue.enqueue(async () => {
      await pending.promise;
      finished = true;
    });

    expect(finished).toBe(false);
  });

  test("runs the work one piece at a time, in the order it was given", async () => {
    const first = deferred();
    const order: string[] = [];
    const queue = createBackgroundQueue(() => {});

    queue.enqueue(async () => {
      order.push("first started");
      await first.promise;
      order.push("first finished");
    });
    queue.enqueue(async () => {
      order.push("second started");
    });
    first.resolve();
    await settled(queue);

    expect(order).toEqual(["first started", "first finished", "second started"]);
  });

  test("builds nothing ahead of time, so each piece sees what the one before it left", async () => {
    let stored: Record<string, number> = { kept: 1 };
    let seen: Record<string, number> = {};
    const queue = createBackgroundQueue(() => {});

    queue.enqueue(async () => {
      stored = { ...stored, added: 2 };
    });
    queue.enqueue(async () => {
      seen = { ...stored };
    });
    await settled(queue);

    expect(seen).toEqual({ kept: 1, added: 2 });
  });

  test("reports a failure and still runs the work queued behind it", async () => {
    const failure = new Error("Preferences could not be saved.");
    const onError = vi.fn();
    let ranAfter = false;
    const queue = createBackgroundQueue(onError);

    queue.enqueue(async () => {
      throw failure;
    });
    queue.enqueue(async () => {
      ranAfter = true;
    });
    await settled(queue);

    expect(onError).toHaveBeenCalledWith(failure);
    expect(ranAfter).toBe(true);
  });

  test("runs work queued from inside a piece after the work already queued", async () => {
    const order: string[] = [];
    const queue = createBackgroundQueue(() => {});

    queue.enqueue(async () => {
      order.push("first");
      queue.enqueue(async () => {
        order.push("queued from the first");
      });
    });
    queue.enqueue(async () => {
      order.push("second");
    });
    await settled(queue);

    expect(order).toEqual(["first", "second"]);
    await settled(queue);
    expect(order).toEqual(["first", "second", "queued from the first"]);
  });
});
