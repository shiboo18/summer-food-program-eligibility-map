import { describe, expect, test, vi } from "vitest";

import type { CredentialVerifier } from "../../contracts.js";
import type { CredentialVerification, SmartyCredentials } from "../../types/credentials.js";
import {
  checkStoredCredentials,
  saveAcceptedCredentials,
  toCredentialInput,
  toSmartyCredentials,
} from "../smarty-credentials.js";

function verifierAnswering(verification: CredentialVerification): CredentialVerifier & {
  verify: ReturnType<typeof vi.fn>;
} {
  return { verify: vi.fn(async (credentials: SmartyCredentials) => ({ credentials, verification })) };
}

const key: SmartyCredentials = { authId: "id", authToken: "token" };

describe("toSmartyCredentials", () => {
  test("trims both stored or typed halves into a whole key", () => {
    const credentials = toSmartyCredentials({ smartyAuthId: "  id ", smartyAuthToken: "\ttoken\n" });

    expect(credentials).toEqual({ authId: "id", authToken: "token" });
  });

  test.each([
    { case: "both halves are absent", input: {} },
    { case: "the Auth ID is empty", input: { smartyAuthId: "", smartyAuthToken: "token" } },
    { case: "the Auth Token is absent", input: { smartyAuthId: "id" } },
    { case: "the Auth ID is only whitespace", input: { smartyAuthId: " \t ", smartyAuthToken: "token" } },
  ])("is undefined when $case", ({ input }) => {
    const credentials = toSmartyCredentials(input);

    expect(credentials).toBeUndefined();
  });
});

describe("toCredentialInput", () => {
  test("names each half the way the store and the form do", () => {
    const input = toCredentialInput({ authId: "id", authToken: "token" });

    expect(input).toEqual({ smartyAuthId: "id", smartyAuthToken: "token" });
  });

  test("round-trips through toSmartyCredentials unchanged", () => {
    const roundTripped = toSmartyCredentials(toCredentialInput(key));

    expect(roundTripped).toEqual(key);
  });
});

describe("checkStoredCredentials", () => {
  test("answers not-set without asking Smarty when no whole key is stored", async () => {
    const verifier = verifierAnswering("validated");

    const check = await checkStoredCredentials(async () => undefined, verifier);

    expect(check).toBe("not-set");
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  test.each<CredentialVerification>(["validated", "rejected", "no-subscription", "unreachable"])(
    "passes on Smarty's verdict on the stored key: %s",
    async (verification) => {
      const verifier = verifierAnswering(verification);

      const check = await checkStoredCredentials(async () => key, verifier);

      expect(check).toBe(verification);
      expect(verifier.verify).toHaveBeenCalledWith(key);
    },
  );
});

describe("saveAcceptedCredentials", () => {
  function ports(verification: CredentialVerification) {
    return {
      store: vi.fn(async (_credentials: SmartyCredentials): Promise<void> => undefined),
      verifier: verifierAnswering(verification),
    };
  }

  test("refuses half a key without asking Smarty or storing anything", async () => {
    const save = ports("validated");

    await expect(saveAcceptedCredentials(undefined, save)).rejects.toThrow(
      "Enter both the Auth ID and the Auth Token.",
    );
    expect(save.verifier.verify).not.toHaveBeenCalled();
    expect(save.store).not.toHaveBeenCalled();
  });

  test.each<CredentialVerification>(["rejected", "no-subscription"])(
    "does not store a key Smarty answers %s",
    async (verification) => {
      const save = ports(verification);

      const outcome = await saveAcceptedCredentials(key, save);

      expect(outcome).toEqual({ saved: false, check: verification });
      expect(save.store).not.toHaveBeenCalled();
    },
  );

  test.each<CredentialVerification>(["validated", "unreachable"])(
    "stores the whole key when Smarty answers %s",
    async (verification) => {
      const save = ports(verification);

      const outcome = await saveAcceptedCredentials(key, save);

      expect(outcome).toEqual({ saved: true, check: verification });
      expect(save.verifier.verify).toHaveBeenCalledWith(key);
      expect(save.store).toHaveBeenCalledWith(key);
    },
  );

  test("reports a failure to store as a failure, not as saved", async () => {
    const save = ports("validated");
    save.store.mockRejectedValueOnce(new Error("Secure credential storage is unavailable on this device."));

    await expect(saveAcceptedCredentials(key, save)).rejects.toThrow(
      "Secure credential storage is unavailable on this device.",
    );
  });
});
