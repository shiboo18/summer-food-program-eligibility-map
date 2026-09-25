import { describe, expect, test, vi } from "vitest";

import { KyHttpClient } from "../ky-http-client.js";

const base = "https://example.com/rest/services/Thing/FeatureServer";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Records the URLs requested so joining and retries can both be asserted. */
function recordingFetch(responses: readonly Response[]): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  let call = 0;
  const implementation = vi.fn(async (input: RequestInfo | URL) => {
    urls.push(input instanceof Request ? input.url : String(input));
    const response = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return response.clone();
  });
  return { fetch: implementation as unknown as typeof fetch, urls };
}

describe("KyHttpClient", () => {
  test("joins the path onto the injected base URL and appends params", async () => {
    const { fetch, urls } = recordingFetch([jsonResponse({ count: 1 })]);
    const client = new KyHttpClient(base, fetch);

    await expect(client.get("0/query", { f: "json", inSR: "4326" })).resolves.toEqual({ count: 1 });
    expect(urls[0]).toBe(`${base}/0/query?f=json&inSR=4326`);
  });

  /* The base URL has no trailing slash, so plain URL resolution would drop
     "FeatureServer" and query the wrong endpoint. */
  test("keeps the last segment of a base URL that has no trailing slash", async () => {
    const { fetch, urls } = recordingFetch([jsonResponse({})]);
    const client = new KyHttpClient(base, fetch);

    await client.get("query");

    expect(urls[0]).toBe(`${base}/query`);
  });

  test("ignores a leading slash on the path", async () => {
    const { fetch, urls } = recordingFetch([jsonResponse({})]);
    const client = new KyHttpClient(`${base}/`, fetch);

    await client.get("/query");

    expect(urls[0]).toBe(`${base}/query`);
  });

  test("retries a 429 after the delay the service asks for, then succeeds", async () => {
    const { fetch, urls } = recordingFetch([
      jsonResponse({ error: "slow down" }, 429, { "retry-after": "0" }),
      jsonResponse({ count: 7 }),
    ]);
    const client = new KyHttpClient(base, fetch);

    await expect(client.get("0/query")).resolves.toEqual({ count: 7 });
    expect(urls).toHaveLength(2);
  });

  test("gives up after the retry budget and reports the status", async () => {
    const { fetch, urls } = recordingFetch([jsonResponse({}, 429, { "retry-after": "0" })]);
    const client = new KyHttpClient(base, fetch);

    await expect(client.get("0/query")).rejects.toThrow("HTTP 429");
    // The first attempt plus the configured retries.
    expect(urls).toHaveLength(4);
  });

  test("does not retry a client error that is not throttling", async () => {
    const { fetch, urls } = recordingFetch([jsonResponse({}, 400)]);
    const client = new KyHttpClient(base, fetch);

    await expect(client.get("0/query")).rejects.toThrow("HTTP 400");
    expect(urls).toHaveLength(1);
  });

  test("reports a transport failure without leaking its detail", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new KyHttpClient(base, failing as unknown as typeof fetch);

    await expect(client.get("0/query")).rejects.toThrow("could not reach the service");
  });
});
