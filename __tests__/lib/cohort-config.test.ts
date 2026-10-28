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

  it("has a match page for dsa: the cohort banner, an intro, Dutch starters and a subject per mode", () => {
    const page = getCohortConfig("dsa").matchPage;
    expect(page?.banner?.src).toBe("/email-images/welcome-dsa.png");
    expect(page?.banner?.alt).toBeTruthy();
    expect(page?.intro).toBeTruthy();
    expect(page?.starters?.length).toBeGreaterThan(0);
    for (const s of page?.starters ?? []) {
      expect(s.text).toBeTruthy();
      expect(s.translation).toBeTruthy();
    }
    const subjects = (["local", "online", "unknown"] as const).map((mode) =>
      page?.emailSubject?.({ topic: "coffee", mode }),
    );
    expect(new Set(subjects).size).toBe(3);
    expect(subjects[0]).toContain("coffee");
    expect(subjects.every((s) => s?.includes("Dutch Speaking Academy"))).toBe(true);
  });
});
