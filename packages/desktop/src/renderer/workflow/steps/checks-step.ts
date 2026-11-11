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
      : "The address check always runs. Add USDA checks if you need them.",
  isAvailable: (context) => context.fileName !== null,
};

/**
 * Say where an export puts the results, naming the columns it appends in the
 * order it writes them.
 */
export function resultsLocation(headers: readonly string[]): string {
  const names = new Intl.ListFormat("en", { type: "conjunction" }).format(headers);
  return `Results go in a copy of your file, as new columns after your last column: ${names}. Your original file isn't changed.`;
}
