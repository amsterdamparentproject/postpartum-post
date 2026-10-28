import { describe, it, expect, vi } from "vitest";
import { retryOnRateLimit, isRateLimitError } from "@/lib/retry-rate-limit";

const rateLimit = { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" };

describe("retryOnRateLimit", () => {
  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retryOnRateLimit(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries 429s and succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(rateLimit).mockRejectedValueOnce(rateLimit).mockResolvedValue("ok");
    await expect(retryOnRateLimit(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up after the retry limit and rethrows the original error", async () => {
    const fn = vi.fn().mockRejectedValue(rateLimit);
    await expect(retryOnRateLimit(fn, { retries: 2, baseDelayMs: 1 })).rejects.toBe(rateLimit);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-rate-limit errors", async () => {
    const err = { name: "validation_error", statusCode: 422, message: "bad address" };
    const fn = vi.fn().mockRejectedValue(err);
    await expect(retryOnRateLimit(fn, { baseDelayMs: 1 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("detects rate-limit errors by status code or name", () => {
    expect(isRateLimitError({ statusCode: 429 })).toBe(true);
    expect(isRateLimitError({ name: "rate_limit_exceeded" })).toBe(true);
    expect(isRateLimitError(new Error("x"))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe("retryOnRateLimit with the Resend SDK's returned { error } shape", () => {
  it("retries when the rate-limit error is returned, not thrown", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: rateLimit })
      .mockResolvedValueOnce({ data: { id: "1" }, error: null });
    await expect(retryOnRateLimit(fn, { baseDelayMs: 1 })).resolves.toEqual({ data: { id: "1" }, error: null });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("passes the final rate-limit error through after exhausting retries", async () => {
    const result = { data: null, error: rateLimit };
    const fn = vi.fn().mockResolvedValue(result);
    await expect(retryOnRateLimit(fn, { retries: 2, baseDelayMs: 1 })).resolves.toBe(result);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry other returned errors", async () => {
    const result = { data: null, error: { name: "validation_error", statusCode: 422, message: "bad" } };
    const fn = vi.fn().mockResolvedValue(result);
    await expect(retryOnRateLimit(fn, { baseDelayMs: 1 })).resolves.toBe(result);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
