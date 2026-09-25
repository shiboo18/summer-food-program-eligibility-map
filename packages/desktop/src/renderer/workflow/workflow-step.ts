import type { ValidationReport } from "../../../../backend/dist/index.js";

export interface WorkflowContext {
  readonly fileName: string | null;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly report: ValidationReport | null;
}

/** One page of the validation workflow. Each step owns its own copy and entry rules. */
export interface WorkflowStep {
  readonly id: string;
  readonly label: string;
  /** Short, context-free explanation used on the home page. */
  readonly summary: string;
  /** Element id of the page section this step renders. */
  readonly sectionId: string;
  /** Element focused when the step becomes active. */
  readonly focusSelector: string;
  title(context: WorkflowContext): string;
  description(context: WorkflowContext): string;
  /** A step stays grayed out until its own prerequisites are met. */
  isAvailable(context: WorkflowContext): boolean;
}
