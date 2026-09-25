import SmartySDK from "smartystreets-javascript-sdk";

import type { AddressValidator } from "../../contracts.js";
import type { Address, AddressVerificationResult } from "../../types/address.js";
import type { ProgressReporter } from "../../types/progress.js";

type SmartyBatch = InstanceType<typeof SmartySDK.core.Batch>;
type SmartyLookup = InstanceType<typeof SmartySDK.usStreet.Lookup>;

/** Smarty accepts at most 100 lookups per batch request. */
const maximumBatchSize = 100;

interface SmartyClient {
  send(batch: SmartyBatch): Promise<void>;
}

interface SmartyCredentials {
  readonly authId: string | undefined;
  readonly authToken: string | undefined;
}

type SmartyCredentialProvider = () => Promise<SmartyCredentials>;
export type SmartyClientFactory = (authId: string, authToken: string) => SmartyClient;

const createSmartyClient: SmartyClientFactory = (authId, authToken) => {
  const credentials = new SmartySDK.core.BasicAuthCredentials(authId, authToken);
  const client = new SmartySDK.core.ClientBuilder(credentials).buildUsStreetApiClient();
  return {
    send: async (batch): Promise<void> => {
      await client.send(batch);
    },
  };
};

/** Validates US addresses with Smarty while keeping secret credentials in the Electron main process. */
export class SmartyAddressValidator implements AddressValidator {
  public constructor(
    private readonly getCredentials: SmartyCredentialProvider,
    private readonly createClient: SmartyClientFactory = createSmartyClient,
  ) {}

  public async validate(
    addresses: readonly Address[],
    onProgress?: ProgressReporter,
  ): Promise<readonly AddressVerificationResult[]> {
    if (addresses.length === 0) {
      return [];
    }

    const { authId, authToken } = await this.getAndResolveCredentials();
    const client = this.createClient(authId, authToken);
    const results: AddressVerificationResult[] = [];
    for (let start = 0; start < addresses.length; start += maximumBatchSize) {
      const chunk = addresses.slice(start, start + maximumBatchSize);
      results.push(...(await this.validateChunk(client, chunk)));
      /* A batch is the smallest unit Smarty answers in, so progress moves a
         batch at a time rather than an address at a time. */
      onProgress?.(results.length);
    }
    return results;
  }

  /** The stored credentials, trimmed and confirmed usable before any request is built. */
  private async getAndResolveCredentials(): Promise<{ readonly authId: string; readonly authToken: string }> {
    const stored = await this.getCredentials();
    const authId = stored.authId?.trim() ?? "";
    const authToken = stored.authToken?.trim() ?? "";
    if (!authId || !authToken) {
      throw new Error("Configure Smarty AUTH_ID and AUTH_TOKEN in Settings before verifying.");
    }
    return { authId, authToken };
  }

  private async validateChunk(
    client: SmartyClient,
    addresses: readonly Address[],
  ): Promise<AddressVerificationResult[]> {
    const batch = new SmartySDK.core.Batch();
    const lookups: SmartyLookup[] = [];
    for (const address of addresses) {
      const lookup = createLookup(address);
      lookups.push(lookup);
      batch.add(lookup);
    }

    try {
      await client.send(batch);
    } catch (error: unknown) {
      throw new Error("Smarty could not verify the addresses. Check the credentials and connection, then try again.", {
        cause: error,
      });
    }

    return addresses.map((address, index) => toResult(address, lookups[index]));
  }
}

function toResult(address: Address, lookup: SmartyLookup | undefined): AddressVerificationResult {
  const candidate = lookup?.result[0];
  if (candidate === undefined) {
    return {
      status: "unverified",
      inputAddress: address,
      messages: ["Smarty could not verify this address."],
    };
  }

  const normalizedAddress = candidateToAddress(candidate);
  if (normalizedAddress === undefined) {
    return {
      status: "unverified",
      inputAddress: address,
      messages: ["Smarty returned an incomplete address result."],
    };
  }

  if (!addressesMatch(address, normalizedAddress)) {
    return { status: "corrected", inputAddress: address, normalizedAddress, messages: [] };
  }
  return { status: "verified", inputAddress: address, normalizedAddress, messages: [] };
}

function createLookup(address: Address): SmartyLookup {
  const lookup = new SmartySDK.usStreet.Lookup();
  lookup.street = address.line1;
  lookup.secondary = address.line2;
  lookup.city = address.city;
  lookup.state = address.state;
  lookup.zipCode = address.postalCode;
  lookup.match = "strict";
  lookup.maxCandidates = 1;
  return lookup;
}

function candidateToAddress(
  candidate: InstanceType<typeof SmartySDK.usStreet.Candidate>,
): Address | undefined {
  const line1 = candidate.deliveryLine1.trim();
  const line2 = candidate.deliveryLine2.trim();
  const city = candidate.components.cityName?.trim() ?? "";
  const state = candidate.components.state?.trim() ?? "";
  const zipCode = candidate.components.zipCode?.trim() ?? "";
  const plus4Code = candidate.components.plus4Code?.trim() ?? "";
  if (!line1 || !city || !state || !zipCode) {
    return undefined;
  }

  const postalCode = plus4Code ? `${zipCode}-${plus4Code}` : zipCode;
  if (line2) {
    return { line1, line2, city, state, postalCode, countryCode: "US" };
  }
  return { line1, city, state, postalCode, countryCode: "US" };
}

function addressesMatch(left: Address, right: Address): boolean {
  return (
    canonical(left.line1) === canonical(right.line1) &&
    canonical(left.line2 ?? "") === canonical(right.line2 ?? "") &&
    canonical(left.city) === canonical(right.city) &&
    canonical(left.state) === canonical(right.state) &&
    canonical(left.postalCode) === canonical(right.postalCode)
  );
}

function canonical(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}
