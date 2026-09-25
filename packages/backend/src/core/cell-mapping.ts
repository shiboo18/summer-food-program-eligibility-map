import {
  cellAtColumn,
  columnNumberFromCell,
  isCellReference,
  rowNumberFromCell,
} from "./cell-reference.js";
import type { AddressField } from "./address-fields.js";

export interface TypedCell {
  readonly field: AddressField;
  readonly label: string;
  readonly required: boolean;
  readonly value: string;
}

export type CellMappingResult =
  | { readonly ok: true; readonly cells: Readonly<Partial<Record<AddressField, string>>> }
  | { readonly ok: false; readonly message: string };

/** Validates typed header cells, reporting the first problem found. */
export function parseTypedCells(entries: readonly TypedCell[]): CellMappingResult {
  const cells: Partial<Record<AddressField, string>> = {};

  for (const { field, label, required, value } of entries) {
    const cell = value.trim();
    if (cell.length === 0) {
      if (required) {
        return { ok: false, message: `${label} needs a header cell such as A1.` };
      }
      continue;
    }
    if (!isCellReference(cell)) {
      return { ok: false, message: `${label} needs a header cell such as A1.` };
    }
    cells[field] = cell.toUpperCase();
  }

  return { ok: true, cells };
}

/**
 * The cells that follow a lead cell, one per remaining field. Headers share a
 * row, so the next field sits in the next column.
 */
export function followingCells(lead: string, count: number): readonly string[] {
  const column = columnNumberFromCell(lead);
  const row = rowNumberFromCell(lead);
  if (column === undefined || row === undefined) {
    return [];
  }
  return Array.from({ length: count }, (_, index) => cellAtColumn(column + index + 1, row));
}
