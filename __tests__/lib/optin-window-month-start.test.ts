import { describe, it, expect } from "vitest";
import { amsterdamMonthStart } from "@/lib/optin-window";

describe("amsterdamMonthStart", () => {
  it("is 22:00 UTC the evening before in summer time (UTC+2)", () => {
    expect(amsterdamMonthStart("2026-10-01").toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(amsterdamMonthStart("2026-07-01").toISOString()).toBe("2026-06-30T22:00:00.000Z");
  });

  it("is 23:00 UTC the evening before in winter time (UTC+1)", () => {
    expect(amsterdamMonthStart("2026-12-01").toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(amsterdamMonthStart("2027-02-01").toISOString()).toBe("2027-01-31T23:00:00.000Z");
  });
});
