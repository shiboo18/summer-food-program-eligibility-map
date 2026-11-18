import ky, { isHTTPError, type KyInstance } from "ky";

import type { HttpGetClient } from "../../contracts.js";
import { HTTP_CLIENT_CONFIG } from "../../config/constants.js";

/**
 * JSON-over-HTTP transport, one instance per external system with its base URL
 * injected.
 *
 * ky supplies the retries a large batch needs: a 429 (and 413/503) waits for the
 * service's `Retry-After` (seconds or an HTTP-date, else the rate-limit headers),
 * and other retryable failures back off exponentially. ky skips jitter when the
 * server names a delay, so that delay is followed exactly.
 */
export class KyHttpClient implements HttpGetClient {
  private readonly baseUrl: string;
  private readonly client: KyInstance;

  /** `fetch` is injectable so tests can drive real retry paths without a network. */
  public constructor(baseUrl: string, fetchImplementation?: typeof fetch) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    this.client = ky.create({
      timeout: HTTP_CLIENT_CONFIG.timeoutMs,
      retry: {
        limit: HTTP_CLIENT_CONFIG.retryLimit,
        maxRetryAfter: HTTP_CLIENT_CONFIG.maxRetryAfterMs,
        // Spread simultaneous retries so a throttled batch does not resume in lockstep.
        jitter: true,
      },
      ...(fetchImplementation === undefined ? {} : { fetch: fetchImplementation }),
    });
  }

  public async get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    try {
      return await this.client.get(this.url(path), { searchParams: params }).json();
    } catch (error: unknown) {
      if (isHTTPError(error)) {
        throw new Error(`The service returned an unexpected response (HTTP ${error.response.status}).`, {
          cause: error,
        });
      }
      throw new Error("The request could not reach the service. Check your connection and try again.", {
        cause: error,
      });
    }
  }

  /**
   * Joins explicitly rather than relying on ky's `baseUrl`, because URL
   * resolution would drop the last path segment of a base that has no trailing
   * slash — silently pointing a FeatureServer query at the wrong endpoint.
   */
  private url(path: string): string {
    return `${this.baseUrl}${path.replace(/^\/+/, "")}`;
  }
}
