import type { CheckOutcome } from "../../types/eligibility.js";
import type { ProgressReporter } from "../../types/progress.js";

/**
 * Runs `work` over `items` with at most `limit` of them in flight, returning one
 * outcome per item in input order however they finish.
 *
 * An item that throws becomes an `ok: false` outcome rather than rejecting, so a
 * single bad row cannot abandon the rest of the sheet. That is the whole reason
 * this returns outcomes instead of values.
 *
 * `limit` is bounded rather than unbounded because these items are network calls
 * against a public service: too many at once invites throttling, and one at a
 * time is needlessly slow.
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
