import type { Address } from "../types/address.js";

/** What one row's mapped columns turned out to hold. */
export type ParsedAddress =
  | { readonly kind: "blank" }
  | { readonly kind: "invalid" }
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
 * Read one row's mapped cell text as a US address.
 *
 * A row is blank when every mapped column is empty: a gap in the sheet, not a
 * fault. Otherwise every column must be filled and look like what it should be,
 * so a mis-mapped column is caught here instead of failing at Smarty row after
 * row.
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
    return { kind: "invalid" };
  }
  if (!streetPattern.test(line1)) {
    return { kind: "invalid" };
  }
  if (!placeNamePattern.test(city)) {
    return { kind: "invalid" };
  }
  if (!statePattern.test(state)) {
    return { kind: "invalid" };
  }

  const zip = zipMissingLeadingZeroPattern.test(postalCode) ? `0${postalCode}` : postalCode;
  if (!zipPattern.test(zip)) {
    return { kind: "invalid" };
  }

  return {
    kind: "address",
    address: line2
      ? { line1, line2, city, state, postalCode: zip, countryCode: "US" }
      : { line1, city, state, postalCode: zip, countryCode: "US" },
  };
}

/** Format an address on one line, as in "1 Main St, Apt 2, Austin, TX 78701". */
export function formatAddress(address: Address): string {
  const parts = [address.line1, address.line2, `${address.city}, ${address.state} ${address.postalCode}`];
  return parts.filter((part) => part !== undefined && part.length > 0).join(", ");
}
