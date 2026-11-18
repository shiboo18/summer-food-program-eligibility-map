import type { GeoPoint, LocatedRow } from "../../types/eligibility.js";
import type { ProgressReporter } from "../../types/progress.js";
import { USDA_CHECK_CONCURRENCY } from "../../config/constants.js";
import { coordinateKey } from "./geocode-quality.js";

/**
 * Run `work` over `items` with at most `limit` in flight, returning one value
 * per item in input order.
 *
 * An item that throws reads as `undefined` rather than rejecting, so one bad row
 * cannot abandon the rest of the sheet. `limit` is bounded because the items are
 * calls to a public service: too many at once invites throttling.
 */
export async function mapWithConcurrency<Item, Value>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<Value>,
  onProgress?: ProgressReporter,
): Promise<readonly (Value | undefined)[]> {
  const values: (Value | undefined)[] = [];
  let next = 0;
  let completed = 0;

  async function runWorker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        values[index] = await work(items[index] as Item);
      } catch {
        values[index] = undefined;
      }
      completed += 1;
      onProgress?.(completed);
    }
  }

  const workers = Math.min(Math.max(limit, 1), Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workers }, async () => runWorker()));
  return values;
}

/**
 * Look up a value at each located row's coordinate, keyed by row number. Rows at
 * the same coordinate share one lookup, failures included; a failed lookup maps
 * to `undefined`.
 */
export async function checkByCoordinate<Value>(
  rows: readonly LocatedRow[],
  lookup: (point: GeoPoint) => Promise<Value>,
  onProgress?: ProgressReporter,
): Promise<ReadonlyMap<number, Value | undefined>> {
  const byCoordinate = new Map<string, Promise<Value>>();
  const values = await mapWithConcurrency(
    rows,
    USDA_CHECK_CONCURRENCY,
    async (row) => {
      const key = coordinateKey(row.geocode.point);
      let pending = byCoordinate.get(key);
      if (pending === undefined) {
        pending = lookup(row.geocode.point);
        byCoordinate.set(key, pending);
      }
      return pending;
    },
    onProgress,
  );
  return new Map(rows.map((row, index) => [row.rowNumber, values[index]]));
}
