import type { WorkflowStep } from "../workflow-step.js";

export const resultsStep: WorkflowStep = {
  id: "results",
  label: "Review results",
  summary: "See each address's deliverability plus its USDA rural and area eligibility.",
  sectionId: "results-section",
  focusSelector: "#download-results",
  title: (context) =>
    context.report !== null && context.report.failures.length === 0
      ? "All addresses deliverable"
      : "Review results",
  description: (context) =>
    context.report === null
      ? "Check the addresses to see results."
      : "Review each row, then export an annotated copy that adds new columns after your data.",
  isAvailable: (context) => context.report !== null,
};
