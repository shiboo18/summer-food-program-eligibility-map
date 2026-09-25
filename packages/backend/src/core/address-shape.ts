import type { Address } from "../types/address.js";

/** What one row's mapped columns turned out to hold. */
export type ParsedAddress =
  | { readonly kind: "blank" }
  | { readonly kind: "invalid"; readonly reason: string }
  | { readonly kind: "address"; readonly address: Address };

/**
 * A street with a name in it, rather than a bare house number. Catches the street
 * number landing in the street column on its own.
 */
const streetPattern = /[A-Za-z]/;

/**
 * A place name: letters, and the spacing and punctuation US place names use, as in
 * St. Louis, O'Fallon and Winston-Salem. No digits, so a ZIP code or a house number
 * mapped to the city column is caught here rather than at Smarty.
 */
const placeNamePattern = /^[A-Za-z][A-Za-z .'-]*$/;

/** A two-letter code or a spelled-out name; "Washington, D.C." included. */
const statePattern = /^[A-Za-z][A-Za-z .,]*$/;

/** Five digits, with the optional plus-four. */
const zipPattern = /^\d{5}(-\d{4})?$/;

/** A ZIP code Excel stored as a number, so its leading zero was dropped. */
const zipMissingLeadingZeroPattern = /^\d{4}$/;

/**
 * Reads one row's mapped cell text as a US address.
 *
 * A row is blank when every mapped column is empty, which is a gap in the sheet
 * rather than a fault. Otherwise every column must be filled and must look like
 * what it is meant to be — a check that keeps a mis-mapped column from being sent
 * off as an address and coming back unverifiable row after row.
 *
 * Only the first problem found is reported: the partner fixes one thing per row,
 * and a missing column is named before the shape of what is there.
 */
export function parseAddress(cells: {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
}): ParsedAddress {
  const line1 = cells.line1.trim();
  const line2 = cells.line2?.trim() ?? "";
  const city = cells.city.trim();
  const state = cells.state.trim();
  const postalCode = cells.postalCode.trim();

  if (!line1 && !city && !state && !postalCode) {
    return { kind: "blank" };
  }
  if (!line1 || !city || !state || !postalCode) {
    return { kind: "invalid", reason: "Missing street, city, state, or ZIP code." };
  }
  if (!streetPattern.test(line1)) {
    return {
      kind: "invalid",
      reason: `Street "${line1}" has no street name — check which column the street is in.`,
    };
  }
  if (!placeNamePattern.test(city)) {
    return {
      kind: "invalid",
      reason: `City "${city}" is not a city name — check which column the city is in.`,
    };
  }
  if (!statePattern.test(state)) {
    return {
      kind: "invalid",
      reason: `State "${state}" is not a state — use a two-letter code like CA, or the full name.`,
    };
  }

  const zip = zipMissingLeadingZeroPattern.test(postalCode) ? `0${postalCode}` : postalCode;
  if (!zipPattern.test(zip)) {
    return { kind: "invalid", reason: `ZIP code "${postalCode}" is not a 5-digit US ZIP code.` };
  }

  return {
    kind: "address",
    address: line2
      ? { line1, line2, city, state, postalCode: zip, countryCode: "US" }
      : { line1, city, state, postalCode: zip, countryCode: "US" },
  };
}
