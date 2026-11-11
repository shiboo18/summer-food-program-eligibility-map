import type { CheckOutcome } from "../../types/eligibility.js";
import type { ProgressReporter } from "../../types/progress.js";

/**
 * Run `work` over `items` with at most `limit` in flight, returning one outcome
 * per item in input order.
 *
 * An item that throws becomes an `ok: false` outcome rather than rejecting, so
 * one bad row cannot abandon the rest of the sheet. `limit` is bounded because
 * the items are calls to a public service: too many at once invites throttling.
 */
export async function mapWithConcurrency<Item, Value>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<Value>,
  onProgress?: ProgressReporter,
): Promise<readonly CheckOutcome<Value>[]> {
  const outcomes: CheckOutcome<Value>[] = [];
  let next = 0;
  let completed = 0;

  async function runWorker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index] as Item;
      try {
        outcomes[index] = { ok: true, value: await work(item) };
      } catch (error: unknown) {
        outcomes[index] = { ok: false, reason: reasonFor(error) };
      }
      completed += 1;
      onProgress?.(completed);
    }
  }

  const workers = Math.min(Math.max(limit, 1), Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workers }, async () => runWorker()));
  return outcomes;
}

function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
