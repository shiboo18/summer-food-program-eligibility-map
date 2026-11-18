import type { WorkflowStep } from "../workflow-step.js";

export const resultsStep: WorkflowStep = {
  id: "results",
  label: "Review results",
  summary:
    "See each address's deliverability plus USDA rural and area eligibility, and which rows need a closer look.",
  sectionId: "results-section",
  focusSelector: "#download-results",
  title: (context) =>
    context.report !== null && context.report.failed === 0
      ? "All addresses deliverable"
      : "Review results",
  description: () => "Review each row, then export an annotated copy that adds new columns after your data.",
  isAvailable: (context) => context.report !== null,
};
