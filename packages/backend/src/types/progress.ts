/** The stages of a run, in the order the partner passes through them. */
export type RunPhase = "verifying" | "rural" | "area";

/** How far a run has got, as the main process reports it to the screen. */
export interface RunProgress {
  readonly phase: RunPhase;
  /** Rows finished in this phase. */
  readonly completed: number;
  /** Rows the phase has to get through, which is the sheet's data row count. */
  readonly total: number;
}

/**
 * Called as a phase advances, with the number of rows finished so far.
 *
 * The total is left to the caller that reports onward: a service knows how many
 * rows it was handed, not how many the sheet holds.
 */
export type ProgressReporter = (completed: number) => void;
