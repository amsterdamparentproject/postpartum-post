import { describe, it, expect } from "vitest";
import { cohortRevealFor } from "@/lib/cohort-reveal";

const NAMES = new Map([["dsa", "Dutch Speaking Academy"]]);

describe("cohortRevealFor", () => {
  it("is null unless both members share a cohort", () => {
    expect(cohortRevealFor(null, null, NAMES)).toBeNull();
    expect(cohortRevealFor("dsa", null, NAMES)).toBeNull();
    expect(cohortRevealFor(null, "dsa", NAMES)).toBeNull();
    expect(cohortRevealFor("dsa", "aic", NAMES)).toBeNull();
  });

  it("gives a shared cohort its name, banner and generic subject", () => {
    const opts = cohortRevealFor("dsa", "dsa", NAMES);
    expect(opts?.name).toBe("Dutch Speaking Academy");
    expect(opts?.headerHtml).toContain("welcome-dsa.png");
    expect(opts?.headerPreload).toContain("welcome-dsa.png");
    expect(opts?.emailSubject).toBe("Let's plan our meetup! (Dutch Speaking Academy × Postpartum Post)");
  });

  it("falls back to generic wording when the name lookup or the config is missing", () => {
    const opts = cohortRevealFor("aic", "aic", new Map());
    expect(opts).toEqual({ name: "your partner program", headerHtml: null, headerPreload: null, emailSubject: null });
  });
});
