import type { WorkflowStep } from "../workflow-step.js";

export const checksStep: WorkflowStep = {
  id: "checks",
  label: "Choose checks",
  summary: "Pick which USDA checks to run — rural and area eligibility are checked online against USDA data.",
  sectionId: "checks-section",
  focusSelector: "#check-rural",
  title: () => "Which checks to run",
  description: (context) =>
    context.fileName === null
      ? "Upload and map an Excel file to choose checks."
      : "Address validation is required — it produces the geocode the USDA eligibility checks need.",
  isAvailable: (context) => context.fileName !== null,
};
