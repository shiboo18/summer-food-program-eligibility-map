/**
 * Wrap an action so only the most recently started call delivers its result.
 * An earlier call that finishes later is dropped, failure included: an answer
 * about a key the partner has since replaced must not overwrite the current one.
 *
 * The returned function rejects only when the latest call's action rejects.
 */
export function latestOnly<Args extends readonly unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
  deliver: (result: Result) => void,
): (...args: Args) => Promise<void> {
  let latest = 0;
  return async (...args: Args): Promise<void> => {
    latest += 1;
    const call = latest;
    try {
      const result = await action(...args);
      if (call === latest) {
        deliver(result);
      }
    } catch (error: unknown) {
      if (call === latest) {
        throw error;
      }
    }
  };
}
