import type { CredentialStatus } from "../../../../backend/dist/index.js";

/** The Smarty secrets vibeCheck stores. */
export type SmartyCredential = keyof CredentialStatus;

export interface CredentialFieldDescriptor {
  readonly name: SmartyCredential;
  /** Label shown beside the field, matching the wording on Smarty's key page. */
  readonly label: string;
}

/**
 * The credential fields in form order. This one table drives the inputs, their
 * configured/not-configured status, and the values sent to the encrypted store.
 * Values are never read back out, so these are always password inputs.
 */
export const credentialFields: readonly CredentialFieldDescriptor[] = [
  { name: "smartyAuthId", label: "AUTH_ID" },
  { name: "smartyAuthToken", label: "AUTH_TOKEN" },
];
