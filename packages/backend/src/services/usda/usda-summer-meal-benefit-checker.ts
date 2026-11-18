import type { HttpGetClient, SummerMealBenefitChecker } from "../../contracts.js";
import type { AreaEligibility, AreaEligibilityResult, GeoPoint, LocatedRow } from "../../types/eligibility.js";
import type { ProgressReporter } from "../../types/progress.js";
import { AREA_ELIGIBILITY_FIELD, AREA_ELIGIBILITY_VALUES } from "../../config/constants.js";
import { checkByCoordinate } from "../../core/run/concurrency.js";

/**
 * Determines the 3-state USDA area eligibility for each point by intersecting it
 * against the SFSP block-group layer and reading the `FY26_Eligibility` field
 * (Eligible / Averaged Eligible / Not Eligible). A point no block group contains
 * is `unknown` rather than a failure: the map simply has nothing to say about it.
 */
export class UsdaSummerMealBenefitChecker implements SummerMealBenefitChecker {
  public constructor(private readonly http: HttpGetClient) {}

  public async checkBenefitBatch(
    rows: readonly LocatedRow[],
    onProgress?: ProgressReporter,
  ): Promise<ReadonlyMap<number, AreaEligibilityResult | undefined>> {
    return checkByCoordinate(rows, (point) => this.areaEligibilityAt(point), onProgress);
  }

  private async areaEligibilityAt(point: GeoPoint): Promise<AreaEligibilityResult> {
    let payload: unknown;
    try {
      payload = await this.http.get("query", {
        geometry: `${point.lng},${point.lat}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: AREA_ELIGIBILITY_FIELD,
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
    return { eligibility: toEligibility(attributes[AREA_ELIGIBILITY_FIELD]) };
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
