import type { ColumnMapping } from "../types/spreadsheet.js";
import type { CachedColumnMapping } from "../types/preferences.js";
import { cellAtColumn, headerAtCell } from "./cell-reference.js";

/** The address fields a spreadsheet column can be mapped to. */
export type AddressField = "line1" | "line2" | "city" | "state" | "postalCode";

export interface AddressFieldDescriptor {
  readonly field: AddressField;
  /** Human label shown beside the column control. */
  readonly label: string;
  /** Optional fields offer a "not used" choice and may be left unmapped. */
  readonly optional: boolean;
  /** Lower-case column-name fragments used to guess this field's column. */
  readonly candidates: readonly string[];
}

/**
 * The address fields in form order. This table drives the mapping selects, the
 * column guesses, the Settings dropdowns, and the mapping sent to the backend, so
 * adding a field is an edit here plus its select in index.html.
 */
export const addressFields: readonly AddressFieldDescriptor[] = [
  { field: "line1", label: "Street address", optional: false, candidates: ["address", "street", "line1"] },
  {
    field: "line2",
    label: "Street address line 2",
    optional: true,
    candidates: ["line2", "apt", "unit", "suite"],
  },
  { field: "city", label: "City", optional: false, candidates: ["city", "town"] },
  { field: "state", label: "State", optional: false, candidates: ["state", "province", "region"] },
  { field: "postalCode", label: "ZIP code", optional: false, candidates: ["zip", "postal"] },
];

/** The column a name sits in, or -1. An empty name is no column, not an unnamed one. */
function columnOf(name: string, headers: readonly string[]): number {
  return name.length === 0 ? -1 : headers.indexOf(name);
}

/** Whether a field occupies a column. An optional field left unused does not. */
function inUse(descriptor: AddressFieldDescriptor, chosen: Readonly<Record<AddressField, string>>): boolean {
  return !descriptor.optional || chosen[descriptor.field].length > 0;
}

/**
 * Return the columns the fields after `changed` should take once `changed` has
 * its own.
 *
 * Partners keep the parts of an address in adjacent columns, so each field in use
 * takes the next column in [addressFields] order. An unused field occupies no
 * column, so the fields after it move up: a sheet with no second address line has
 * its city beside the street.
 *
 * @param changed The field whose column was just chosen.
 * @param chosen Every field's column as the screen holds it, `changed` included.
 *   An empty name means the field is not in use.
 * @returns A column name for each field after `changed`; fields at or before it
 *   are absent, so answers already given are never disturbed. A name is empty
 *   where the field is unused, the column that far along does not exist or is
 *   unnamed, or nothing up to `changed` names a column.
 */
export function followingHeaders(
  changed: AddressField,
  chosen: Readonly<Record<AddressField, string>>,
  headers: readonly string[],
): Readonly<Partial<Record<AddressField, string>>> {
  /* A slot counts only the fields in use, which lets an unused field close the gap. */
  const slots = new Map<AddressField, number>();
  for (const descriptor of addressFields) {
    if (inUse(descriptor, chosen)) {
      slots.set(descriptor.field, slots.size);
    }
  }

  const at = addressFields.findIndex(({ field }) => field === changed);
  /* Count from the nearest field, up to and including `changed`, that still names a
     column: setting line 2 to "not used" leaves the fields after it following the
     street. */
  let from: { readonly column: number; readonly slot: number } | undefined;
  for (const { field } of addressFields.slice(0, at + 1).reverse()) {
    const column = columnOf(chosen[field], headers);
    const slot = slots.get(field);
    if (column !== -1 && slot !== undefined) {
      from = { column, slot };
      break;
    }
  }

  const following: Partial<Record<AddressField, string>> = {};
  for (const { field } of addressFields.slice(at + 1)) {
    const slot = slots.get(field);
    following[field] =
      from === undefined || slot === undefined ? "" : (headers[from.column + slot - from.slot] ?? "");
  }
  return following;
}

/**
 * Convert a chosen mapping to the header cells preferences are stored in. The
 * cache keeps cells only and drops anything else, so names cannot be stored. A
 * column this sheet does not have is dropped rather than saved stale.
 *
 * @param headerRow Sheet row the names were read from, so the stored cell reads
 *   the way it does in the file even when a legend row sits above the names.
 */
export function cachedColumnMapping(
  mapping: ColumnMapping,
  headers: readonly string[],
  headerRow: number,
): CachedColumnMapping {
  const cached: Record<string, string> = {};
  for (const [field, name] of Object.entries(mapping)) {
    const column = columnOf(name, headers);
    if (column !== -1) {
      cached[field] = cellAtColumn(column + 1, headerRow);
    }
  }
  return cached;
}

/** Guesses a column when its name matches a candidate, exactly before loosely. */
function guessHeader(headers: readonly string[], candidates: readonly string[]): string {
  const named = (match: (header: string, candidate: string) => boolean): string | undefined => {
    for (const candidate of candidates) {
      const header = headers.find((name) => match(name.trim().toLowerCase(), candidate));
      if (header !== undefined) {
        return header;
      }
    }
    return undefined;
  };

  return (
    named((header, candidate) => header === candidate) ??
    named((header, candidate) => header.includes(candidate)) ??
    ""
  );
}

/**
 * Return the column a mapping select should offer for one field: the saved
 * cell's column when it names one in this file, else a guess from the field's
 * candidates, else nothing. The saved cell wins so the screen shows what was kept.
 */
export function preferredHeader(
  cell: string | undefined,
  headers: readonly string[],
  candidates: readonly string[],
): string {
  const saved = cell === undefined ? undefined : headerAtCell(cell, headers);
  return saved ?? guessHeader(headers, candidates);
}

