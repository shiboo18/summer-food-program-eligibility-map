import type { ProgressReporter } from "../../types/progress.js";

/**
 * Splits one phase of the bar between the passes that make it up.
 *
 * Checking is a single phase to the partner, but it runs as several passes over
 * the same rows: locating them, then each selected USDA check. Each pass counts
 * its own rows from zero, so reporting them directly would fill the phase's share
 * of the bar once per pass. Each reporter here maps its pass's count into that
 * pass's slice of the total, so the phase advances once, in order.
 *
 * @param passCount How many passes share the phase. Below one is treated as one.
 * @param total Rows the phase has to get through.
 * @param report Where to send the combined count.
 */
export function createPassReporters(
  passCount: number,
  total: number,
  report: ProgressReporter,
): readonly ProgressReporter[] {
  const passes = Math.max(passCount, 1);
  return Array.from({ length: passes }, (_unused, pass): ProgressReporter => {
    return (completed: number): void => {
      const throughPass = total <= 0 ? 1 : Math.min(Math.max(completed / total, 0), 1);
      report(Math.round(((pass + throughPass) / passes) * total));
    };
  });
}
