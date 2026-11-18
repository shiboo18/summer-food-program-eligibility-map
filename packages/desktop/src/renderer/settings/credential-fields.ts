import type { SmartyCredentialField } from "../../../../backend/dist/index.js";

export interface CredentialFieldDescriptor {
  readonly name: SmartyCredentialField;
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
