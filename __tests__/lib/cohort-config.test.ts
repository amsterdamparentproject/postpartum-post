import { describe, it, expect } from "vitest";
import { COHORT_CONFIG, getCohortConfig } from "@/lib/cohort-config";

describe("cohort config", () => {
  it("returns an empty (all generic) config for a missing, null or unknown slug", () => {
    expect(getCohortConfig(undefined)).toEqual({});
    expect(getCohortConfig(null)).toEqual({});
    expect(getCohortConfig("not-a-cohort")).toEqual({});
  });

  it("has a header, preload and note for dsa", () => {
    const dsa = getCohortConfig("dsa");
    expect(dsa.headerHtml).toContain("welcome-dsa.png");
    expect(dsa.headerPreload).toContain("welcome-dsa.png");
    expect(dsa.optinNote?.body).toBeTruthy();
  });

  it("pairs every header with a preload", () => {
    for (const [slug, config] of Object.entries(COHORT_CONFIG)) {
      expect(Boolean(config.headerHtml), slug).toBe(Boolean(config.headerPreload));
    }
  });
});
