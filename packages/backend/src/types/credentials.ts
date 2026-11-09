/** A Smarty secret key as the main process holds it; either half may be absent. */
export interface SmartyCredentials {
  readonly authId: string | undefined;
  readonly authToken: string | undefined;
}

/** What Smarty said when asked about a secret key. */
export type CredentialVerification = "validated" | "rejected" | "no-subscription" | "unreachable";

/** The state of the stored secret key: absent, or Smarty's answer about it. */
export type CredentialCheck = CredentialVerification | "not-set";
