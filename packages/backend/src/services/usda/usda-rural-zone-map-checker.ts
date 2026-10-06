import type { HttpGetClient, RuralZoneChecker } from "../../contracts.js";
import type { CheckOutcome, GeoPoint, LocatedRow, RuralResult } from "../../types/eligibility.js";
import type { ProgressReporter } from "../../types/progress.js";
import { USDA_CHECK_CONCURRENCY, USDA_RURAL_CRITERIA, USDA_RURAL_LAYER_IDS } from "../../config/constants.js";
import { mapWithConcurrency } from "../../core/run/concurrency.js";
import { coordinateKey } from "../../core/run/geocode-quality.js";

/**
 * Comma-free `layerDefs` selecting every rural-criteria layer with no attribute
 * filter, so one service-level query returns a per-layer intersect count. Built
 * once from the configured layer ids.
 */
const ruralLayerDefs = JSON.stringify(Object.fromEntries(USDA_RURAL_LAYER_IDS.map((id) => [id, ""])));

/**
 * Determines USDA rural designation by intersecting each point against the five
 * rural-criteria layers. A point in ANY layer is rural; the matched layers are
 * reported as human-readable criteria.
 *
 * The five layers are asked for in one service-level `layerDefs` query rather
 * than one request per layer, so each point costs a single request. The batch is
 * still paced a few points at a time to keep a large sheet from flooding a free
 * public service.
 */
export class UsdaRuralZoneMapChecker implements RuralZoneChecker {
  public constructor(private readonly http: HttpGetClient) {}

  public async checkZoneBatch(
    rows: readonly LocatedRow[],
    onProgress?: ProgressReporter,
  ): Promise<ReadonlyMap<number, CheckOutcome<RuralResult>>> {
    /* Rows at the same coordinate share one in-flight lookup, so a duplicate
       never issues its own request and takes the first row's outcome — including
       a failure, which is therefore reported alike rather than retried. Scoped to
       this call, so there is no state to invalidate between runs. */
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
 * retry layer never sees, so it is caught here. A response without the `layers`
 * array is treated as an error rather than "not rural": a malformed answer must
 * not quietly read as a negative result.
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
