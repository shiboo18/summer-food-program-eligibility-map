/** How far validation has got, as the main process reports it to the screen. */
export interface RunProgress {
  /** Rows finished so far. */
  readonly completed: number;
  /** Rows to get through, which is the sheet's data row count. */
  readonly total: number;
}

/**
 * Called as validation advances, with the number of rows finished so far.
 *
 * The total is left to the caller that reports onward: a service knows how many
 * rows it was handed, not how many the sheet holds.
 */
export type ProgressReporter = (completed: number) => void;
