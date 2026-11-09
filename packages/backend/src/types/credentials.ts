/** A whole Smarty secret key, trimmed. Half a key cannot be used, so there is no partial form. */
export interface SmartyCredentials {
  readonly authId: string;
  readonly authToken: string;
}

/** What Smarty said when asked about a secret key. */
export type CredentialVerification = "validated" | "rejected" | "no-subscription" | "unreachable";

/**
 * A Smarty key together with Smarty's verdict on it. It carries the secret, so
 * it stays in the main process; the renderer is only ever told the verdict.
 */
export interface ResolvedSmartyCredentials {
  readonly credentials: SmartyCredentials;
  readonly verification: CredentialVerification;
}

/** The stored key's state as the renderer sees it: absent, or Smarty's verdict on it. */
export type CredentialCheck = CredentialVerification | "not-set";
