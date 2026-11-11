import type { CredentialStatus } from "../../../../backend/dist/index.js";

/** The Smarty secrets vibeCheck stores. */
export type SmartyCredential = keyof CredentialStatus;

export interface CredentialFieldDescriptor {
  readonly name: SmartyCredential;
  /** Label shown beside the field, matching the wording on Smarty's key page. */
  readonly label: string;
}

/**
 * The credential fields in form order. This table drives the inputs, their
 * placeholders, and the values sent to the encrypted store. Stored values are
 * never read back, so these are always password inputs.
 */
export const credentialFields: readonly CredentialFieldDescriptor[] = [
  { name: "smartyAuthId", label: "Auth ID" },
  { name: "smartyAuthToken", label: "Auth Token" },
];
