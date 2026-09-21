import { afterEach, describe, expect, test, vi } from "vitest";

import { FetchJsonHttpClient } from "../fetch-json-http-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(implementation: typeof fetch): void {
  vi.stubGlobal("fetch", vi.fn(implementation));
}

describe("FetchJsonHttpClient", () => {
  test("appends params as a query string and returns parsed JSON", async () => {
    const jsonResponse = { candidates: [] };
    stubFetch(async () => new Response(JSON.stringify(jsonResponse), { status: 200 }));
    const client = new FetchJsonHttpClient();

    const result = await client.getJson("https://example.com/query", { a: "1", b: "two" });

    expect(result).toEqual(jsonResponse);
    expect(fetch).toHaveBeenCalledWith("https://example.com/query?a=1&b=two");
  });

  test("throws a generic error on a non-2xx response", async () => {
    stubFetch(async () => new Response("nope", { status: 500 }));
    const client = new FetchJsonHttpClient();

    await expect(client.getJson("https://example.com", {})).rejects.toThrow("HTTP 500");
  });

  test("wraps transport failures without leaking details", async () => {
    stubFetch(async () => {
      throw new Error("socket hang up");
    });
    const client = new FetchJsonHttpClient();

    await expect(client.getJson("https://example.com", {})).rejects.toThrow("could not reach the service");
  });
});
