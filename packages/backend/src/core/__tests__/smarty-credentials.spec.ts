import { describe, expect, test, vi } from "vitest";

import type { CredentialVerifier } from "../../contracts.js";
import type { CredentialVerification, SmartyCredentials } from "../../types/credentials.js";
import { checkStoredCredentials, resolveCredentials } from "../smarty-credentials.js";

function verifierAnswering(verdict: CredentialVerification): CredentialVerifier & {
  verify: ReturnType<typeof vi.fn>;
} {
  return { verify: vi.fn(async () => verdict) };
}

const stored = (credentials: SmartyCredentials) => async (): Promise<SmartyCredentials> => credentials;

describe("checkStoredCredentials", () => {
  test.each([
    { case: "nothing is stored", credentials: { authId: undefined, authToken: undefined } },
    { case: "only the Auth ID is stored", credentials: { authId: "id", authToken: undefined } },
    { case: "only the Auth Token is stored", credentials: { authId: undefined, authToken: "token" } },
    { case: "the Auth Token is only whitespace", credentials: { authId: "id", authToken: "   " } },
  ])("answers not-set without asking Smarty when $case", async ({ credentials }) => {
    const verifier = verifierAnswering("validated");

    const check = await checkStoredCredentials(stored(credentials), verifier);

    expect(check).toBe("not-set");
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  test.each<CredentialVerification>(["validated", "rejected", "no-subscription", "unreachable"])(
    "passes Smarty's answer through when a whole key is stored: %s",
    async (verdict) => {
      const verifier = verifierAnswering(verdict);

      const check = await checkStoredCredentials(stored({ authId: " id ", authToken: " token " }), verifier);

      expect(check).toBe(verdict);
      expect(verifier.verify).toHaveBeenCalledWith("id", "token");
    },
  );
});

describe("resolveCredentials", () => {
  test("trims both halves of a whole key", () => {
    const resolved = resolveCredentials({ authId: "  id ", authToken: "\ttoken\n" });

    expect(resolved).toEqual({ authId: "id", authToken: "token" });
  });

  test.each([
    { case: "both halves are absent", credentials: { authId: undefined, authToken: undefined } },
    { case: "the Auth ID is empty", credentials: { authId: "", authToken: "token" } },
    { case: "the Auth Token is absent", credentials: { authId: "id", authToken: undefined } },
    { case: "the Auth ID is only whitespace", credentials: { authId: " \t ", authToken: "token" } },
  ])("returns undefined when $case", ({ credentials }) => {
    const resolved = resolveCredentials(credentials);

    expect(resolved).toBeUndefined();
  });
});
