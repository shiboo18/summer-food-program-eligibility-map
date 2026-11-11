import { SMARTY_US_STREET_URL, SMARTY_VERIFY_TIMEOUT_MS } from "../../config/constants.js";
import type { CredentialVerifier } from "../../contracts.js";
import type {
  CredentialVerification,
  ResolvedSmartyCredentials,
  SmartyCredentials,
} from "../../types/credentials.js";

/**
 * Smarty authenticates a request before it reads the payload, so a request with
 * no street is refused with 401/402/403 for a bad key and only reaches the
 * "missing street" 400 once the key is accepted. No address is sent, so no
 * lookup is spent. Any other status says nothing about the key.
 */
const verdictByStatus: ReadonlyMap<number, CredentialVerification> = new Map([
  [200, "validated"],
  [400, "validated"],
  [401, "rejected"],
  [402, "no-subscription"],
  [403, "rejected"],
]);

/** Checks a Smarty secret key against the US Street API without submitting an address. */
export class SmartyCredentialVerifier implements CredentialVerifier {
  /** `fetch` is injectable so tests answer for Smarty; the default is the platform's. */
  public constructor(
    private readonly fetchImplementation: typeof fetch = (input, init) => fetch(input, init),
    private readonly timeoutMs: number = SMARTY_VERIFY_TIMEOUT_MS,
  ) {}

  public async verify(credentials: SmartyCredentials): Promise<ResolvedSmartyCredentials> {
    return { credentials, verification: await this.ask(credentials) };
  }

  private async ask({ authId, authToken }: SmartyCredentials): Promise<CredentialVerification> {
    const url = new URL(SMARTY_US_STREET_URL);
    url.searchParams.set("auth-id", authId);
    url.searchParams.set("auth-token", authToken);

    let response: Response;
    try {
      /* No retries: this runs in the background on launch, and a retry would only
         delay an answer the partner is waiting on. */
      response = await this.fetchImplementation(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      return "unreachable";
    }
    /* The status is the whole answer. The body is discarded to release the
       connection, and a failure doing so changes nothing. */
    await response.body?.cancel().catch(() => undefined);
    return verdictByStatus.get(response.status) ?? "unreachable";
  }
}
