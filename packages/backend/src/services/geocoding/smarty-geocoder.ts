import SmartySDK from "smartystreets-javascript-sdk";

import type { Address } from "../../types/address.js";
import type { Geocoder } from "../../contracts.js";
import type { GeocodeResult } from "../../types/eligibility.js";

type SmartyBatch = InstanceType<typeof SmartySDK.core.Batch>;
type SmartyLookup = InstanceType<typeof SmartySDK.usStreet.Lookup>;

interface SmartyClient {
  send(batch: SmartyBatch): Promise<void>;
}

interface SmartyCredentials {
  readonly authId: string | undefined;
  readonly authToken: string | undefined;
}

type SmartyCredentialProvider = () => Promise<SmartyCredentials>;
export type SmartyGeocoderClientFactory = (authId: string, authToken: string) => SmartyClient;

const createSmartyClient: SmartyGeocoderClientFactory = (authId, authToken) => {
  const credentials = new SmartySDK.core.BasicAuthCredentials(authId, authToken);
  const client = new SmartySDK.core.ClientBuilder(credentials).buildUsStreetApiClient();
  return {
    send: async (batch): Promise<void> => {
      await client.send(batch);
    },
  };
};

/**
 * Geocodes with the sponsor's own Smarty account. Only a rooftop-precision
 * match is treated as high confidence; coarser (block-level / ZIP) matches
 * score below the confidence threshold so the pipeline flags them for
 * verification. Returns `undefined` when Smarty has no coordinate.
 */
export class SmartyGeocoder implements Geocoder {
  public constructor(
    private readonly getCredentials: SmartyCredentialProvider,
    private readonly createClient: SmartyGeocoderClientFactory = createSmartyClient,
  ) {}

  public async geocode(address: Address): Promise<GeocodeResult | undefined> {
    const credentials = await this.getCredentials();
    const authId = credentials.authId?.trim();
    const authToken = credentials.authToken?.trim();
    if (!authId || !authToken) {
      throw new Error("Configure Smarty AUTH_ID and AUTH_TOKEN in Settings before verifying.");
    }

    const client = this.createClient(authId, authToken);
    const lookup = createLookup(address);
    const batch = new SmartySDK.core.Batch();
    batch.add(lookup);

    try {
      await client.send(batch);
    } catch (error: unknown) {
      throw new Error("Smarty could not locate the address. Check the credentials and connection, then try again.", {
        cause: error,
      });
    }

    const candidate = lookup.result[0];
    const latitude = candidate?.metadata.latitude;
    const longitude = candidate?.metadata.longitude;
    if (candidate === undefined || latitude === undefined || longitude === undefined) {
      return undefined;
    }
    return {
      point: { lat: latitude, lng: longitude },
      score: scoreForPrecision(candidate.metadata.precision),
      matchedAddress: candidate.deliveryLine1.trim(),
      source: "smarty",
    };
  }
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

/** Only rooftop precision is trusted (score 100); coarser matches stay below the confidence gate. */
function scoreForPrecision(precision: string | undefined): number {
  if (precision === undefined) {
    return 0;
  }
  return precision.toLowerCase().includes("rooftop") ? 100 : 85;
}
