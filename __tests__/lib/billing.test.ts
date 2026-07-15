import { describe, it, expect, vi, afterEach } from "vitest";
import { extendToNext5thOfMonth, nextMatchDate } from "@/lib/billing";

describe("extendToNext5thOfMonth", () => {
  it("rolls forward to the same month's 5th when the date is before it", () => {
    const result = extendToNext5thOfMonth(new Date("2026-11-01T10:00:00Z"));
    expect(result.toISOString()).toBe("2026-11-05T00:00:00.000Z");
  });

  it("rolls forward to next month's 5th when the date is after it", () => {
    const result = extendToNext5thOfMonth(new Date("2026-11-06T10:00:00Z"));
    expect(result.toISOString()).toBe("2026-12-05T00:00:00.000Z");
  });

  it("rolls forward to next month's 5th when the date is exactly the 5th", () => {
    // Reaching the boundary means "the next occurrence" — this is what makes
    // extendSubscriptionToNext5th() safe to call repeatedly for skips/grants
    // on an already-aligned subscription instead of becoming a no-op.
    const result = extendToNext5thOfMonth(new Date("2026-08-05T00:00:00Z"));
    expect(result.toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });

  it("handles a December-to-January year rollover", () => {
    const result = extendToNext5thOfMonth(new Date("2026-12-10T00:00:00Z"));
    expect(result.toISOString()).toBe("2027-01-05T00:00:00.000Z");
  });
});

describe("nextMatchDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("floors to the pilot's first match date for signups before it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
    expect(new Date(nextMatchDate() * 1000).toISOString()).toBe("2026-07-05T00:00:00.000Z");
  });

  it("returns this month's 5th when today is before it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T00:00:00Z"));
    expect(new Date(nextMatchDate() * 1000).toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });

  it("returns next month's 5th when today is after it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T00:00:00Z"));
    expect(new Date(nextMatchDate() * 1000).toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });
});
