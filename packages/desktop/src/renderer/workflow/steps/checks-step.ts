import type { WorkflowStep } from "../workflow-step.js";

export const checksStep: WorkflowStep = {
  id: "checks",
  label: "Choose checks",
  summary: "Pick which USDA checks to run — rural and area eligibility are checked online against USDA data.",
  sectionId: "checks-section",
  focusSelector: "#check-address-validation",
  title: () => "Choose checks",
  description: (context) =>
    context.fileName === null
      ? "Upload and map a file to choose checks."
      : "Address validation always runs. Add USDA checks if you need them.",
  isAvailable: (context) => context.fileName !== null,
};
