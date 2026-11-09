import { describe, expect, test, vi } from "vitest";

import { SMARTY_US_STREET_URL } from "../../../config/constants.js";
import type { SmartyCredentials } from "../../../types/credentials.js";
import { SmartyCredentialVerifier } from "../smarty-credential-verifier.js";

const key: SmartyCredentials = { authId: "id", authToken: "token" };

/** Answers every request with one status, recording what was asked for. */
function fetchAnswering(status: number): { fetch: typeof fetch; requests: URL[] } {
  const requests: URL[] = [];
  const implementation = vi.fn(async (input: RequestInfo | URL) => {
    requests.push(new URL(input instanceof Request ? input.url : String(input)));
    return new Response(status === 200 ? "[]" : "", { status });
  });
  return { fetch: implementation as unknown as typeof fetch, requests };
}

describe("SmartyCredentialVerifier", () => {
  /* Smarty checks the key before the payload, so a missing street only gets as
     far as a 400 once the key has been accepted. */
  test.each([
    { status: 400, expected: "validated" },
    { status: 200, expected: "validated" },
    { status: 401, expected: "rejected" },
    { status: 403, expected: "rejected" },
    { status: 402, expected: "no-subscription" },
    { status: 429, expected: "unreachable" },
    { status: 500, expected: "unreachable" },
    { status: 503, expected: "unreachable" },
  ])("answers HTTP $status as $expected, alongside the key it was asked about", async ({ status, expected }) => {
    const { fetch } = fetchAnswering(status);
    const verifier = new SmartyCredentialVerifier(fetch);

    const resolved = await verifier.verify(key);

    expect(resolved).toEqual({ credentials: key, verification: expected });
  });

  test("sends the key to the US Street endpoint with no address attached", async () => {
    const { fetch, requests } = fetchAnswering(400);
    const verifier = new SmartyCredentialVerifier(fetch);

    await verifier.verify(key);

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(`${request.origin}${request.pathname}`).toBe(SMARTY_US_STREET_URL);
    expect(request.searchParams.get("auth-id")).toBe("id");
    expect(request.searchParams.get("auth-token")).toBe("token");
    expect([...request.searchParams.keys()].sort()).toEqual(["auth-id", "auth-token"]);
  });

  test("encodes characters that would otherwise break the query string", async () => {
    const { fetch, requests } = fetchAnswering(400);
    const verifier = new SmartyCredentialVerifier(fetch);

    await verifier.verify({ authId: "id", authToken: "a&b=c+d" });

    expect(requests[0].searchParams.get("auth-token")).toBe("a&b=c+d");
    expect(requests[0].search).toContain("auth-token=a%26b%3Dc%2Bd");
  });

  /* The status is the answer; a body that fails while being discarded must not
     turn an accepted key into "unreachable". */
  test("keeps Smarty's answer when discarding the response body fails", async () => {
    const erroringBody = new ReadableStream({
      start(controller) {
        controller.error(new Error("stream broke"));
      },
    });
    const answering = vi.fn(async () => new Response(erroringBody, { status: 400 })) as unknown as typeof fetch;
    const verifier = new SmartyCredentialVerifier(answering);

    const resolved = await verifier.verify(key);

    expect(resolved.verification).toBe("validated");
  });

  test("answers unreachable when the request cannot be made", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const verifier = new SmartyCredentialVerifier(failing);

    const resolved = await verifier.verify(key);

    expect(resolved.verification).toBe("unreachable");
  });

  test("gives up and answers unreachable when Smarty does not answer in time", async () => {
    const hanging = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    ) as unknown as typeof fetch;
    const verifier = new SmartyCredentialVerifier(hanging, 5);

    const resolved = await verifier.verify(key);

    expect(resolved.verification).toBe("unreachable");
  });
});
