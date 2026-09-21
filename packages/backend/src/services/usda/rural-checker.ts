import type { JsonHttpClient, RuralChecker } from "../../contracts.js";
import type { GeoPoint, RuralResult } from "../../types/eligibility.js";
import { USDA_RURAL_CRITERIA, USDA_RURAL_LAYER_IDS, USDA_RURAL_SERVICE_URL } from "../../config/constants.js";
import { FetchJsonHttpClient } from "../http/fetch-json-http-client.js";

/**
 * Determines USDA rural designation by intersecting a point against the five
 * rural-criteria layers. A point in ANY layer is rural; the matched layers are
 * reported as human-readable criteria.
 */
export class UsdaRuralChecker implements RuralChecker {
  public constructor(private readonly http: JsonHttpClient = new FetchJsonHttpClient()) {}

  public async check(point: GeoPoint): Promise<RuralResult> {
    const matchedCriteria: string[] = [];
    for (const layerId of USDA_RURAL_LAYER_IDS) {
      if (await this.layerContains(layerId, point)) {
        matchedCriteria.push(USDA_RURAL_CRITERIA[layerId] ?? `Rural criteria layer ${layerId}`);
      }
    }
    return {
      designation: matchedCriteria.length > 0 ? "rural" : "not-rural",
      matchedCriteria,
    };
  }

  private async layerContains(layerId: number, point: GeoPoint): Promise<boolean> {
    let payload: unknown;
    try {
      payload = await this.http.getJson(`${USDA_RURAL_SERVICE_URL}/${layerId}/query`, {
        geometry: `${point.lng},${point.lat}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        returnCountOnly: "true",
        f: "json",
      });
    } catch (error: unknown) {
      throw new Error("The USDA rural designation could not be determined. Check your connection and try again.", {
        cause: error,
      });
    }
    return featureCount(payload) > 0;
  }
}

function featureCount(payload: unknown): number {
  if (typeof payload !== "object" || payload === null) {
    return 0;
  }
  const record = payload as Record<string, unknown>;
  if (record.error !== undefined) {
    throw new Error("The USDA rural designation service reported an error.");
  }
  return typeof record.count === "number" ? record.count : 0;
}
