/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Workers pull
 * the next item as they free up, so one slow item doesn't hold up a whole
 * chunk. Resolves when every item is done; rejects if `fn` throws (callers
 * here catch per-item errors themselves).
 *
 * Used by the n8n-triggered email routes: sending serially outran n8n's HTTP
 * timeout once the member count grew (2026-11-01 opt-in run cut off at 27/46).
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
}
