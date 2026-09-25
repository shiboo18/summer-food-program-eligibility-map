export interface Address {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly countryCode: "US";
}

export type AddressVerificationStatus = "verified" | "corrected" | "unverified";

export interface AddressVerificationResult {
  readonly status: AddressVerificationStatus;
  readonly inputAddress: Address;
  readonly normalizedAddress?: Address;
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
