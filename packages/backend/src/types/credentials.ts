/** How the store and the credentials form name each half of a Smarty key. */
export type SmartyCredentialField = "smartyAuthId" | "smartyAuthToken";

/** The halves as the credentials form sends them or the store holds them; either may be missing. */
export type CredentialInput = Readonly<Partial<Record<SmartyCredentialField, string>>>;

/** Which halves of the key are stored. Never carries the values themselves. */
export type CredentialStatus = Readonly<Record<SmartyCredentialField, boolean>>;

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
