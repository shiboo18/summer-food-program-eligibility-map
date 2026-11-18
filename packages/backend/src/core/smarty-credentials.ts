import type { CredentialVerifier } from "../contracts.js";
import type {
  CredentialCheck,
  CredentialInput,
  CredentialVerification,
  SmartyCredentials,
  SmartyCredentialsProvider,
} from "../types/credentials.js";

/** Shown when a save reaches the main process without a whole key. */
const INCOMPLETE_KEY_MESSAGE = "Enter both the Auth ID and the Auth Token.";

/**
 * Build a whole, trimmed key from the halves the form sent or the store holds;
 * `undefined` when either half is blank or absent.
 */
export function toSmartyCredentials(input: CredentialInput): SmartyCredentials | undefined {
  const authId = input.smartyAuthId?.trim() ?? "";
  const authToken = input.smartyAuthToken?.trim() ?? "";
  return authId && authToken ? { authId, authToken } : undefined;
}

/** Report the stored key's state for the renderer: not set, or Smarty's verdict, never the key. */
export async function checkStoredCredentials(
  getStored: SmartyCredentialsProvider,
  verifier: CredentialVerifier,
): Promise<CredentialCheck> {
  const credentials = await getStored();
  if (credentials === undefined) {
    return "not-set";
  }
  return (await verifier.verify(credentials)).verification;
}

/**
 * Smarty verdicts that mean a key cannot work, so storing it would only make a
 * later run fail. Not hearing back is not one of them: an offline partner can
 * still set up, and the next launch checks again.
 */
const refusedVerdicts: ReadonlySet<CredentialVerification> = new Set<CredentialVerification>([
  "rejected",
  "no-subscription",
]);

/** What a save did, and Smarty's verdict on the key it was given. */
export interface CredentialSaveOutcome {
  readonly saved: boolean;
  readonly check: CredentialVerification;
}

export interface CredentialSavePorts {
  /**
   * Replace the stored key. Called only for a key Smarty does not refuse;
   * rejects with a partner-facing message when it cannot store.
   */
  readonly store: (credentials: SmartyCredentials) => Promise<void>;
  readonly verifier: CredentialVerifier;
}

/** Store a whole key unless Smarty refuses it. Rejects when given no whole key, or when the store fails. */
export async function saveAcceptedCredentials(
  credentials: SmartyCredentials | undefined,
  ports: CredentialSavePorts,
): Promise<CredentialSaveOutcome> {
  if (credentials === undefined) {
    throw new Error(INCOMPLETE_KEY_MESSAGE);
  }
  const resolved = await ports.verifier.verify(credentials);
  if (refusedVerdicts.has(resolved.verification)) {
    return { saved: false, check: resolved.verification };
  }
  await ports.store(resolved.credentials);
  return { saved: true, check: resolved.verification };
}
