import SmartySDK from "smartystreets-javascript-sdk";

import type { AddressValidator } from "../../contracts.js";
import type { Address, AddressVerificationResult } from "../../types/address.js";
import type { SmartyCredentialsProvider } from "../../types/credentials.js";
import type { LocationPrecision } from "../../types/eligibility.js";
import type { ProgressReporter } from "../../types/progress.js";

type SmartyBatch = InstanceType<typeof SmartySDK.core.Batch>;
type SmartyLookup = InstanceType<typeof SmartySDK.usStreet.Lookup>;

/** Smarty accepts at most 100 lookups per batch request. */
const maximumBatchSize = 100;

interface SmartyClient {
  send(batch: SmartyBatch): Promise<void>;
}

/** The stored key, or `undefined` when no whole key is stored. */
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
    private readonly getCredentials: SmartyCredentialsProvider,
    private readonly createClient: SmartyClientFactory = createSmartyClient,
  ) {}

  public async validate(
    addresses: readonly Address[],
    onProgress?: ProgressReporter,
  ): Promise<readonly AddressVerificationResult[]> {
    if (addresses.length === 0) {
      return [];
    }

    const credentials = await this.getCredentials();
    if (credentials === undefined) {
      throw new Error("Add your Smarty secret key in Settings before running checks.");
    }
    const client = this.createClient(credentials.authId, credentials.authToken);
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

/** Read one lookup's first candidate; no candidate, or one missing a part, is unverified. */
function toResult(address: Address, lookup: SmartyLookup): AddressVerificationResult {
  const candidate = lookup.result[0];
  const normalizedAddress = candidate === undefined ? undefined : candidateToAddress(candidate);
  if (candidate === undefined || normalizedAddress === undefined) {
    return { status: "unverified" };
  }

  const location = candidateToLocation(candidate);
  const status = addressesMatch(address, normalizedAddress) ? "verified" : "corrected";
  return { status, normalizedAddress, ...(location === undefined ? {} : { location }) };
}

function candidateToLocation(
  candidate: InstanceType<typeof SmartySDK.usStreet.Candidate>,
): { lat: number; lng: number; score: number; precision: LocationPrecision } | undefined {
  const { latitude, longitude, precision } = candidate.metadata;
  if (latitude === undefined || longitude === undefined) {
    return undefined;
  }
  /* A Smarty candidate is the USPS address, so the match is certain and the score
     is full; the precision class carries how tightly the point is placed. */
  return { lat: latitude, lng: longitude, score: 100, precision: toPrecision(precision) };
}

/**
 * Smarty's `precision` values, coarsest to finest: Unknown, Zip5 through Zip9,
 * Street, Parcel, Rooftop. Rooftop and Parcel sit on the property; Street is
 * interpolated along the frontage; every Zip level is a centroid.
 */
function toPrecision(precision: string | undefined): LocationPrecision {
  if (precision === undefined) {
    return "unknown";
  }
  const value = precision.toLowerCase();
  if (value.includes("rooftop") || value.includes("parcel")) {
    return "rooftop";
  }
  if (value.includes("street")) {
    return "street";
  }
  if (value.startsWith("zip")) {
    return "postal";
  }
  return "unknown";
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
