/**
 * Retry helper for Resend's 429 "rate_limit_exceeded" errors (10 requests per
 * second per account). The Resend SDK *returns* `{ data, error }` rather than
 * throwing, and its error is a plain object (not an Error instance), so
 * detection checks `statusCode` / `name` directly — on a returned `error` as
 * well as on a thrown value.
 */

export function isRateLimitError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const { statusCode, name } = e as { statusCode?: number; name?: string };
  return statusCode === 429 || name === "rate_limit_exceeded";
}

function resultRateLimited(result: unknown): boolean {
  return !!result && typeof result === "object" && "error" in result && isRateLimitError((result as { error: unknown }).error);
}

/**
 * Runs `fn`, retrying with exponential backoff only on rate-limit failures
 * (thrown, or returned as `{ error }`). Any other outcome is returned/rethrown
 * immediately. Total added wait is capped (default 500 + 1000 + 2000 ms) so a
 * persistent rate limit can't push a batch past the serverless timeout. After
 * the last retry the final result/error is passed through unchanged.
 */
export async function retryOnRateLimit<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 500 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let rateLimited: boolean;
    try {
      const result = await fn();
      rateLimited = resultRateLimited(result);
      if (!rateLimited || attempt >= retries) return result;
    } catch (e) {
      if (!isRateLimitError(e) || attempt >= retries) throw e;
    }
    await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
  }
}
