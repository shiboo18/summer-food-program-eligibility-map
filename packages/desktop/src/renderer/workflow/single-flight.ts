/**
 * Wraps an action so that calling it again while it is still running is ignored.
 * Disabling a button only guards the button; a wizard step reached another way can
 * still ask for work that is already under way.
 */
export function singleFlight<Args extends readonly unknown[]>(
  action: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  let running = false;
  return async (...args: Args): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      await action(...args);
    } finally {
      running = false;
    }
  };
}
