import type { CredentialVerifier } from "../contracts.js";
import type { CredentialCheck, SmartyCredentials } from "../types/credentials.js";

/** A Smarty secret key with both halves present, trimmed. */
export interface ResolvedCredentials {
  readonly authId: string;
  readonly authToken: string;
}

/** Trims both halves of a stored Smarty key, or returns `undefined` when either is blank or absent. */
export function resolveCredentials(stored: SmartyCredentials): ResolvedCredentials | undefined {
  const authId = stored.authId?.trim() ?? "";
  const authToken = stored.authToken?.trim() ?? "";
  return authId && authToken ? { authId, authToken } : undefined;
}

/**
 * Reports the stored Smarty key's state. Smarty is asked only when a whole key is
 * stored; half a key cannot work, so it is reported as not set.
 */
export async function checkStoredCredentials(
  getCredentials: () => Promise<SmartyCredentials>,
  verifier: CredentialVerifier,
): Promise<CredentialCheck> {
  const credentials = resolveCredentials(await getCredentials());
  if (credentials === undefined) {
    return "not-set";
  }
  return verifier.verify(credentials.authId, credentials.authToken);
}
