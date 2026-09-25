import type { ColumnMapping } from "../types/spreadsheet.js";

const requiredFields = ["line1", "city", "state", "postalCode"] as const;

export function parseColumnMapping(value: unknown, headers: readonly string[]): ColumnMapping {
  if (typeof value !== "object" || value === null) {
    throw new Error("Column mapping is invalid.");
  }

  const source = value as Record<string, unknown>;
  const mapping: Record<string, string> = {};
  for (const field of requiredFields) {
    const header = source[field];
    if (typeof header !== "string" || header.trim().length === 0) {
      throw new Error(`Choose a column for ${label(field)}.`);
    }
    if (!headers.includes(header)) {
      throw new Error(`The column "${header}" is not in the uploaded file.`);
    }
    mapping[field] = header;
  }

  const line2 = source.line2;
  if (typeof line2 === "string" && line2.trim().length > 0) {
    if (!headers.includes(line2)) {
      throw new Error(`The column "${line2}" is not in the uploaded file.`);
    }
    mapping.line2 = line2;
  }

  return mapping as unknown as ColumnMapping;
}

function label(field: (typeof requiredFields)[number]): string {
  switch (field) {
    case "line1":
      return "street address";
    case "city":
      return "city";
    case "state":
      return "state";
    default:
      return "ZIP code";
  }
}
