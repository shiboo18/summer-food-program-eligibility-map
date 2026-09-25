/** Work that runs away from the caller, one piece at a time. */
export interface BackgroundQueue {
  /** Queues work to run behind everything already queued. Returns immediately. */
  enqueue(work: () => Promise<void>): void;
  /** Resolves once the work queued before this call has finished. */
  drain(): Promise<void>;
}

/**
 * A queue for saves a screen should not wait on.
 *
 * @param onError Called with whatever a piece of work threw. The pieces behind it
 *   still run, so one failed save does not strand the ones after it.
 */
export function createBackgroundQueue(onError: (error: unknown) => void): BackgroundQueue {
  /* Each piece is chained onto the one before rather than started on arrival, so two
     saves cannot each read the stored value as it was before the other wrote. */
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue(work: () => Promise<void>): void {
      tail = tail.then(async (): Promise<void> => {
        try {
          await work();
        } catch (error: unknown) {
          onError(error);
        }
      });
    },
    /* The tail as it stands when asked, so work queued later is not waited on. */
    drain: (): Promise<void> => tail,
  };
}
