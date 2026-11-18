import type { ProgressReporter } from "../../types/progress.js";

/**
 * Split one phase of the bar between the passes that make it up.
 *
 * Checking is one phase to the partner but runs as several passes over the same
 * rows: locating, then each selected USDA check. Each pass counts from zero, so
 * each reporter maps its count into its own slice and the phase fills once.
 *
 * @param passCount How many passes share the phase, at least one.
 * @param total Rows the phase has to get through.
 * @param report Where to send the combined count.
 */
export function createPassReporters(
  passCount: number,
  total: number,
  report: ProgressReporter,
): readonly ProgressReporter[] {
  return Array.from({ length: passCount }, (_unused, pass): ProgressReporter => {
    return (completed: number): void => {
      const throughPass = total <= 0 ? 1 : Math.min(Math.max(completed / total, 0), 1);
      report(Math.round(((pass + throughPass) / passCount) * total));
    };
  });
}
