import type { WorkflowStep } from "../workflow-step.js";

export const uploadStep: WorkflowStep = {
  id: "upload",
  label: "Upload file",
  summary: "Choose an Excel workbook with a row of column names above the addresses.",
  sectionId: "upload-section",
  focusSelector: "#upload-excel",
  title: () => "Upload your file",
  description: (context) =>
    context.fileName === null
      ? "Pick an Excel workbook with a row of column names above the addresses."
      : `${context.fileName} is loaded. Upload another to start over.`,
  isAvailable: () => true,
};
