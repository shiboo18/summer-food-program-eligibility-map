import type { AreaEligibilityChecker, JsonHttpClient } from "../../contracts.js";
import type { AreaEligibility, AreaEligibilityResult, GeoPoint } from "../../types/eligibility.js";
import {
  AREA_ELIGIBILITY_FIELD,
  AREA_ELIGIBILITY_LAYER_URL,
  AREA_ELIGIBILITY_VALUES,
  AREA_EVIDENCE_FIELDS,
} from "../../config/constants.js";
import { FetchJsonHttpClient } from "../http/fetch-json-http-client.js";

const evidenceFieldNames = Object.values(AREA_EVIDENCE_FIELDS);
const outFields = [AREA_ELIGIBILITY_FIELD, ...evidenceFieldNames].join(",");

/**
 * Determines the 3-state USDA area eligibility for a coordinate by intersecting
 * it against the SFSP block-group layer and reading the `FY26_Eligibility`
 * field (Eligible / Averaged Eligible / Not Eligible). Returns `unknown` when
 * no block group contains the point.
 */
export class UsdaAreaEligibilityChecker implements AreaEligibilityChecker {
  public constructor(private readonly http: JsonHttpClient = new FetchJsonHttpClient()) {}

  public async check(point: GeoPoint): Promise<AreaEligibilityResult> {
    let payload: unknown;
    try {
      payload = await this.http.getJson(`${AREA_ELIGIBILITY_LAYER_URL}/query`, {
        geometry: `${point.lng},${point.lat}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields,
        returnGeometry: "false",
        f: "json",
      });
    } catch (error: unknown) {
      throw new Error("The USDA area eligibility could not be determined. Check your connection and try again.", {
        cause: error,
      });
    }

    const attributes = firstFeatureAttributes(payload);
    if (attributes === undefined) {
      return { eligibility: "unknown" };
    }
    return {
      eligibility: toEligibility(attributes[AREA_ELIGIBILITY_FIELD]),
      geoid: asString(attributes[AREA_EVIDENCE_FIELDS.geoid]),
      county: asString(attributes[AREA_EVIDENCE_FIELDS.county]),
      blockGroupPct: asNumber(attributes[AREA_EVIDENCE_FIELDS.blockGroupPct]),
      tractPct: asNumber(attributes[AREA_EVIDENCE_FIELDS.tractPct]),
      averagedPct: asNumber(attributes[AREA_EVIDENCE_FIELDS.averagedPct]),
    };
  }
}

function toEligibility(value: unknown): AreaEligibility {
  switch (value) {
    case AREA_ELIGIBILITY_VALUES.eligible:
      return "eligible";
    case AREA_ELIGIBILITY_VALUES.averagedEligible:
      return "averaged-eligible";
    case AREA_ELIGIBILITY_VALUES.notEligible:
      return "not-eligible";
    default:
      return "unknown";
  }
}

function firstFeatureAttributes(payload: unknown): Record<string, unknown> | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  if (record.error !== undefined) {
    throw new Error("The USDA area eligibility service reported an error.");
  }
  const features = record.features;
  if (!Array.isArray(features) || features.length === 0) {
    return undefined;
  }
  const first = features[0];
  if (typeof first !== "object" || first === null) {
    return undefined;
  }
  const attributes = (first as Record<string, unknown>).attributes;
  if (typeof attributes !== "object" || attributes === null) {
    return undefined;
  }
  return attributes as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
