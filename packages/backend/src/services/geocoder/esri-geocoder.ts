import type { Address } from "../../types/address.js";
import type { Geocoder, HttpGetClient } from "../../contracts.js";
import type { GeocodeResult, LocationPrecision } from "../../types/eligibility.js";
import { ESRI_FIND_CANDIDATES_PATH } from "../../config/constants.js";

/**
 * Resolves addresses with the free, anonymous Esri World Geocoder. Returns the
 * top candidate's coordinate together with its match score (0–100), which the
 * pipeline uses as its location-confidence signal.
 */
export class EsriGeocoder implements Geocoder {
  public constructor(private readonly http: HttpGetClient) {}

  public async geocode(address: Address): Promise<GeocodeResult | undefined> {
    let payload: unknown;
    try {
      payload = await this.http.get(ESRI_FIND_CANDIDATES_PATH, {
        singleLine: toSingleLine(address),
        outFields: "Match_addr,Addr_type",
        maxLocations: "1",
        f: "json",
      });
    } catch (error: unknown) {
      throw new Error("The address could not be located. Check your connection and try again.", {
        cause: error,
      });
    }

    const candidate = firstCandidate(payload);
    if (candidate === undefined) {
      return undefined;
    }
    return {
      point: { lat: candidate.y, lng: candidate.x },
      score: candidate.score,
      precision: candidate.precision,
      matchedAddress: candidate.address,
    };
  }
}

function toSingleLine(address: Address): string {
  const parts = [address.line1, address.line2, `${address.city}, ${address.state} ${address.postalCode}`];
  return parts.filter((part): part is string => part !== undefined && part.length > 0).join(", ");
}

interface EsriCandidate {
  readonly x: number;
  readonly y: number;
  readonly score: number;
  readonly address: string;
  readonly precision: LocationPrecision;
}

/**
 * Esri's `Addr_type`, which says what kind of thing the point is on. Anything not
 * listed is treated as unknown so a class we have not accounted for is never
 * trusted by accident.
 */
function toPrecision(addressType: unknown): LocationPrecision {
  switch (typeof addressType === "string" ? addressType : "") {
    case "PointAddress":
    case "Subaddress":
      return "rooftop";
    case "StreetAddress":
    case "StreetAddressExt":
    case "StreetInt":
      return "street";
    case "Postal":
    case "PostalExt":
    case "PostalLoc":
      return "postal";
    /* A street centroid with no house number, and town-level hits, are only as
       good as a locality for block-group purposes. */
    case "StreetName":
    case "Locality":
    case "POI":
      return "locality";
    default:
      return "unknown";
  }
}

function firstCandidate(payload: unknown): EsriCandidate | undefined {
  const record = asRecord(payload);
  if (record === undefined) {
    return undefined;
  }
  if (record.error !== undefined) {
    throw new Error("The geocoding service reported an error.");
  }

  const candidates = record.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return undefined;
  }
  const candidate = asRecord(candidates[0]);
  const location = asRecord(candidate?.location);
  if (candidate === undefined || location === undefined) {
    return undefined;
  }
  if (typeof location.x !== "number" || typeof location.y !== "number") {
    return undefined;
  }
  return {
    x: location.x,
    y: location.y,
    score: typeof candidate.score === "number" ? candidate.score : 0,
    address: typeof candidate.address === "string" ? candidate.address : "",
    precision: toPrecision(asRecord(candidate.attributes)?.Addr_type),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
