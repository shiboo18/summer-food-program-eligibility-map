import type { WorkflowStep } from "../workflow-step.js";

export const uploadStep: WorkflowStep = {
  id: "upload",
  label: "Upload file",
  summary: "Choose an Excel workbook whose first row contains column names.",
  sectionId: "upload-section",
  focusSelector: "#upload-excel",
  title: () => "Upload your file",
  description: (context) =>
    context.fileName === null
      ? "Pick an Excel workbook whose first row holds the column names."
      : `${context.fileName} is loaded. Upload another to start over.`,
  isAvailable: () => true,
};
