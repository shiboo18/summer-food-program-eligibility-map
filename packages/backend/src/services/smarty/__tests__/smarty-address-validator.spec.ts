import SmartySDK from "smartystreets-javascript-sdk";
import { describe, expect, test, vi } from "vitest";

import type { Address } from "../../../types/address.js";
import { SmartyAddressValidator, type SmartyClientFactory } from "../smarty-address-validator.js";

type Batch = InstanceType<typeof SmartySDK.core.Batch>;
type Lookup = InstanceType<typeof SmartySDK.usStreet.Lookup>;

function address(line1: string): Address {
  return { line1, city: "Austin", state: "TX", postalCode: "78701", countryCode: "US" };
}

function candidate(deliveryLine1: string) {
  return new SmartySDK.usStreet.Candidate({
    delivery_line_1: deliveryLine1,
    components: { city_name: "AUSTIN", state_abbreviation: "TX", zipcode: "78701" },
  });
}

const credentials = async () => ({ authId: "auth-id", authToken: "auth-token" });

describe("SmartyAddressValidator", () => {
  test("corrects an input whose USPS-normalized address differs from what was typed", async () => {
    const send = vi.fn(async (batch: Batch): Promise<void> => {
      (batch.getByIndex(0) as Lookup).result.push(candidate("1 MAIN STREET"));
    });
    const validator = new SmartyAddressValidator(credentials, () => ({ send }));

    const [result] = await validator.validate([address("1 Main St")]);

    expect(result?.status).toBe("corrected");
    expect(result?.normalizedAddress?.line1).toBe("1 MAIN STREET");
  });

  test("marks an incomplete candidate as unverified rather than trusting a partial address", async () => {
    const send = vi.fn(async (batch: Batch): Promise<void> => {
      (batch.getByIndex(0) as Lookup).result.push(
        new SmartySDK.usStreet.Candidate({
          delivery_line_1: "1 MAIN STREET",
          components: { state_abbreviation: "TX", zipcode: "78701" },
        }),
      );
    });
    const validator = new SmartyAddressValidator(credentials, () => ({ send }));

    await expect(validator.validate([address("1 Main St")])).resolves.toEqual([
      {
        status: "unverified",
        inputAddress: address("1 Main St"),
        messages: ["Smarty returned an incomplete address result."],
      },
    ]);
  });

  test("appends the plus-four code to the normalized postal code", async () => {
    const send = vi.fn(async (batch: Batch): Promise<void> => {
      (batch.getByIndex(0) as Lookup).result.push(
        new SmartySDK.usStreet.Candidate({
          delivery_line_1: "1 MAIN STREET",
          components: { city_name: "AUSTIN", state_abbreviation: "TX", zipcode: "78701", plus4_code: "1234" },
        }),
      );
    });
    const validator = new SmartyAddressValidator(credentials, () => ({ send }));

    const [result] = await validator.validate([address("1 Main St")]);

    expect(result?.status).toBe("corrected");
    expect(result?.normalizedAddress?.postalCode).toBe("78701-1234");
  });

  test("sends one batch and returns a result per input, in order", async () => {
    const send = vi.fn(async (batch: Batch): Promise<void> => {
      (batch.getByIndex(0) as Lookup).result.push(candidate("1 MAIN STREET"));
      (batch.getByIndex(1) as Lookup).result.push(candidate("2 Second St"));
    });
    const validator = new SmartyAddressValidator(credentials, () => ({ send }));

    const results = await validator.validate([address("1 Main St"), address("2 Second St")]);

    expect(send).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.status)).toEqual(["corrected", "verified"]);
  });

  test("splits work into batches of at most 100 lookups", async () => {
    const sizes: number[] = [];
    const send = vi.fn(async (batch: Batch): Promise<void> => {
      sizes.push(batch.length());
      for (const lookup of batch.lookups) {
        (lookup as Lookup).result.push(candidate((lookup as Lookup).street ?? ""));
      }
    });
    const validator = new SmartyAddressValidator(credentials, () => ({ send }));
    const addresses = Array.from({ length: 230 }, (_value, index) => address(`${index} Main St`));

    const results = await validator.validate(addresses);

    expect(sizes).toEqual([100, 100, 30]);
    expect(results).toHaveLength(230);
  });

  test("reports the running total as each batch comes back", async () => {
    const send = vi.fn(async (batch: Batch): Promise<void> => {
      for (const lookup of batch.lookups) {
        (lookup as Lookup).result.push(candidate((lookup as Lookup).street ?? ""));
      }
    });
    const validator = new SmartyAddressValidator(credentials, () => ({ send }));
    const addresses = Array.from({ length: 230 }, (_value, index) => address(`${index} Main St`));
    const reported: number[] = [];

    await validator.validate(addresses, (completed) => reported.push(completed));

    expect(reported).toEqual([100, 200, 230]);
  });

  test("marks addresses without candidates as unverified", async () => {
    const validator = new SmartyAddressValidator(credentials, () => ({
      send: async (): Promise<void> => undefined,
    }));

    await expect(validator.validate([address("1 Main St")])).resolves.toEqual([
      {
        status: "unverified",
        inputAddress: address("1 Main St"),
        messages: ["Smarty could not verify this address."],
      },
    ]);
  });

  test("skips the request and requires both credentials", async () => {
    const createClient = vi.fn<SmartyClientFactory>();
    const validator = new SmartyAddressValidator(async () => ({ authId: "auth-id", authToken: undefined }), createClient);

    await expect(validator.validate([address("1 Main St")])).rejects.toThrow(
      "Configure Smarty AUTH_ID and AUTH_TOKEN in Settings before verifying.",
    );
    expect(createClient).not.toHaveBeenCalled();
    await expect(validator.validate([])).resolves.toEqual([]);
  });

  test("wraps SDK failures without exposing provider details", async () => {
    const validator = new SmartyAddressValidator(credentials, () => ({
      send: async (): Promise<void> => {
        throw new Error("low-level failure");
      },
    }));

    await expect(validator.validate([address("1 Main St")])).rejects.toThrow(
      "Smarty could not verify the addresses. Check the credentials and connection, then try again.",
    );
  });
});
