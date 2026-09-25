import type { WorkflowStep } from "../workflow-step.js";
import { mapColumnsStep } from "./map-columns-step.js";
import { resultsStep } from "./results-step.js";
import { uploadStep } from "./upload-step.js";

export const workflowSteps: readonly WorkflowStep[] = [uploadStep, mapColumnsStep, resultsStep];
