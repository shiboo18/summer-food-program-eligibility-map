import type { LocationPrecision } from "./eligibility.js";

export interface Address {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly countryCode: "US";
}

export type AddressVerificationStatus = "verified" | "corrected" | "unverified";

/**
 * A coordinate Smarty returned for a verified address. The score says how well
 * the address matched; the precision says how tightly the point is placed.
 */
export interface VerifiedLocation {
  readonly lat: number;
  readonly lng: number;
  readonly score: number;
  readonly precision: LocationPrecision;
}

export interface AddressVerificationResult {
  readonly status: AddressVerificationStatus;
  readonly inputAddress: Address;
  readonly normalizedAddress?: Address;
  /** Smarty's rooftop/ZIP coordinate for the address, when it returned one. */
  readonly location?: VerifiedLocation;
  readonly messages: readonly string[];
}

/** One row's verification outcome, carried to the results export. */
export interface RowVerification {
  readonly status: AddressVerificationStatus;
  /** The standardized address, present only when Smarty corrected the input to make it deliverable. */
  readonly standardizedAddress?: string;
}

export interface FailedAddress {
  readonly rowNumber: number;
  readonly address: string;
  readonly reason: string;
}

export interface ValidationReport {
  readonly fileName: string;
  readonly total: number;
  readonly verified: number;
  readonly corrected: number;
  readonly failures: readonly FailedAddress[];
}
