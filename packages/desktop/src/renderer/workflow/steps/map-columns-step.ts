import type { WorkflowStep } from "../workflow-step.js";

export const mapColumnsStep: WorkflowStep = {
  id: "map-columns",
  label: "Map columns",
  summary: "Tell vibeCheck which columns hold the street, city, state, and ZIP code.",
  sectionId: "mapping-section",
  focusSelector: "#map-line1",
  title: () => "Map your columns",
  description: (context) =>
    context.fileName === null
      ? "Upload a file to map its columns."
      : `Match each address field to a column in ${context.fileName}.`,
  isAvailable: (context) => context.fileName !== null,
};

/** Say which row the column names came from, and that addresses start below it. */
export function headerRowHint(headerRowNumber: number): string {
  return `These are the headers vibeCheck found in row ${headerRowNumber}. Addresses are read from row ${headerRowNumber + 1} down.`;
}
