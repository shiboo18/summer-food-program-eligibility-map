import type { HttpGetClient, RuralZoneChecker } from "../../contracts.js";
import type { CheckOutcome, GeoPoint, LocatedRow, RuralResult } from "../../types/eligibility.js";
import type { ProgressReporter } from "../../types/progress.js";
import { USDA_CHECK_CONCURRENCY, USDA_RURAL_CRITERIA, USDA_RURAL_LAYER_IDS } from "../../config/constants.js";
import { mapWithConcurrency } from "../../core/run/concurrency.js";
import { coordinateKey } from "../../core/run/geocode-quality.js";

/**
 * `layerDefs` selecting every rural-criteria layer with no attribute filter, so
 * one service-level query returns a per-layer intersect count.
 */
const ruralLayerDefs = JSON.stringify(Object.fromEntries(USDA_RURAL_LAYER_IDS.map((id) => [id, ""])));

/**
 * Determines USDA rural designation by intersecting each point with the
 * rural-criteria layers. A point in any layer is rural; the matched layers are
 * reported as human-readable criteria.
 *
 * All layers are asked for in one `layerDefs` query per point, and points are
 * paced a few at a time so a large sheet does not flood a free public service.
 */
export class UsdaRuralZoneMapChecker implements RuralZoneChecker {
  public constructor(private readonly http: HttpGetClient) {}

  public async checkZoneBatch(
    rows: readonly LocatedRow[],
    onProgress?: ProgressReporter,
  ): Promise<ReadonlyMap<number, CheckOutcome<RuralResult>>> {
    /* Rows at the same coordinate share one in-flight lookup and its outcome,
       failures included. Scoped to this call, so nothing outlives the run. */
    const byCoordinate = new Map<string, Promise<RuralResult>>();
    const outcomes = await mapWithConcurrency(
      rows,
      USDA_CHECK_CONCURRENCY,
      async (row) => {
        const key = coordinateKey(row.geocode.point);
        let pending = byCoordinate.get(key);
        if (pending === undefined) {
          pending = this.ruralDesignationAt(row.geocode.point);
          byCoordinate.set(key, pending);
        }
        return pending;
      },
      onProgress,
    );
    return new Map(rows.map((row, index) => [row.rowNumber, outcomes[index] as CheckOutcome<RuralResult>]));
  }

  private async ruralDesignationAt(point: GeoPoint): Promise<RuralResult> {
    let payload: unknown;
    try {
      payload = await this.http.get("query", {
        layerDefs: ruralLayerDefs,
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

    const counts = layerCounts(payload);
    /* Ordered by the configured layer ids, not the response order, so the matched
       criteria a partner reads are stable however the service returns them. */
    const matchedCriteria = USDA_RURAL_LAYER_IDS.filter((id) => (counts.get(id) ?? 0) > 0).map(
      (id) => USDA_RURAL_CRITERIA[id] ?? `Rural criteria layer ${id}`,
    );
    return {
      designation: matchedCriteria.length > 0 ? "rural" : "not-rural",
      matchedCriteria,
    };
  }
}

/**
 * Per-layer intersect counts from a `layerDefs` query, keyed by layer id.
 *
 * ArcGIS reports failures as HTTP 200 with an `error` field, which the transport
 * never sees, so it is caught here. A response without `layers` is an error, not
 * "not rural": a malformed answer must not read as a negative result.
 */
function layerCounts(payload: unknown): ReadonlyMap<number, number> {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("The USDA rural designation service returned an unexpected response.");
  }
  const record = payload as Record<string, unknown>;
  if (record.error !== undefined) {
    throw new Error("The USDA rural designation service reported an error.");
  }
  if (!Array.isArray(record.layers)) {
    throw new Error("The USDA rural designation service returned an unexpected response.");
  }
  const counts = new Map<number, number>();
  for (const layer of record.layers) {
    if (typeof layer === "object" && layer !== null) {
      const { id, count } = layer as Record<string, unknown>;
      if (typeof id === "number" && typeof count === "number") {
        counts.set(id, count);
      }
    }
  }
  return counts;
}
