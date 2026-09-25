import type { EligibilityChecks } from "../types/eligibility.js";
import type { RunPhase, RunProgress } from "../types/progress.js";

/** Every phase a run can pass through, in the order they run. */
export const runPhases: readonly RunPhase[] = ["verifying", "rural", "area"];

/** The partner-facing name of each phase, shown as a step in the run screen. */
const phaseLabels: Readonly<Record<RunPhase, string>> = {
  verifying: "Address Verification",
  rural: "USDA Rural",
  area: "USDA Eligibility",
};

/**
 * The phases a run will actually pass through, given the checks chosen. Address
 * verification always runs; each USDA phase runs only when its check is selected,
 * so the bar and the stepper cover the real work rather than every possible step.
 */
export function activeRunPhases(checks: EligibilityChecks): readonly RunPhase[] {
  return [
    "verifying",
    ...(checks.rural ? (["rural"] as const) : []),
    ...(checks.area ? (["area"] as const) : []),
  ];
}

/** Where the bar sits and what it reads, for one report from a run. */
export interface RunProgressView {
  /** 0 to 100, whole, so the bar and what a screen reader hears cannot disagree. */
  readonly percent: number;
  /** The percentage as shown beside the bar. */
  readonly readout: string;
  /** The count line, e.g. `120 of 480 addresses checked`. */
  readonly label: string;
}

/** What each phase has done to the rows it was given, in the partner's words. */
const phaseVerbs: Readonly<Record<RunPhase, string>> = {
  verifying: "verified",
  rural: "checked",
  area: "checked",
};

/**
 * Reads one report from a run as a position on the bar.
 *
 * The bar is shared equally over `active` — the phases this run will actually
 * pass through — so it advances the whole way whichever checks were chosen
 * rather than reserving room for a phase that never runs. A phase with no rows to
 * get through counts as finished, and a count outside its total is held to its
 * share's ends, so an over- or under-count cannot send the bar backwards or past
 * the end.
 */
export function runProgressView(progress: RunProgress, active: readonly RunPhase[]): RunProgressView {
  const share = active.length === 0 ? 1 : 1 / active.length;
  const index = active.indexOf(progress.phase);
  const at = (index < 0 ? 0 : index) * share;
  const through = progress.total <= 0 ? 1 : clamp(progress.completed / progress.total, 0, 1);
  const percent = Math.round((at + through * share) * 100);

  const noun = progress.total === 1 ? "address" : "addresses";
  return {
    percent,
    readout: `${String(percent)}%`,
    label: `${String(progress.completed)} of ${String(progress.total)} ${noun} ${phaseVerbs[progress.phase]}`,
  };
}

/** The state of one phase in the run stepper. */
export type RunStepState = "off" | "pending" | "running" | "done";

/** One phase as the run stepper shows it. */
export interface RunStep {
  readonly phase: RunPhase;
  readonly label: string;
  readonly state: RunStepState;
}

/**
 * The run stepper: every phase in order, each marked off (not part of this run),
 * done, running, or pending, given the phases this run will pass through and the
 * one now running. A phase this run skips reads "off" so the partner sees it was
 * not part of the work rather than stuck.
 */
export function runPhaseSteps(active: readonly RunPhase[], current: RunPhase): readonly RunStep[] {
  const currentIndex = active.indexOf(current);
  return runPhases.map((phase): RunStep => {
    const label = phaseLabels[phase];
    const activeIndex = active.indexOf(phase);
    if (activeIndex < 0) {
      return { phase, label, state: "off" };
    }
    if (currentIndex < 0 || activeIndex > currentIndex) {
      return { phase, label, state: "pending" };
    }
    return { phase, label, state: activeIndex < currentIndex ? "done" : "running" };
  });
}

/** What the run screen says while a phase is the one running. */
export interface RunPhaseCopy {
  /** One line on what the step is doing. */
  readonly detail: string;
  /** What leaves the computer during this step, and where it goes. */
  readonly privacy: string;
}

const usdaPrivacy =
  "Only addresses and their map locations are sent to the public USDA and ArcGIS maps — nothing else leaves this computer";

const phaseCopy: Readonly<Record<RunPhase, RunPhaseCopy>> = {
  verifying: {
    detail: "Checking each address against USPS records with Smarty",
    privacy: "Only addresses are sent to Smarty — nothing else leaves this computer",
  },
  rural: {
    detail: "Looking up each address on the public USDA rural map",
    privacy: usdaPrivacy,
  },
  area: {
    detail: "Looking up each address on the public USDA area-eligibility map",
    privacy: usdaPrivacy,
  },
};

/** What the screen should read while `phase` is the step running. */
export function runPhaseCopy(phase: RunPhase): RunPhaseCopy {
  return phaseCopy[phase];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
