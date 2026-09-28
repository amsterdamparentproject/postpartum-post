import { describe, it, expect } from "vitest";
import { formatExpiry, perkLocationLabel } from "@/lib/perk-display";

describe("formatExpiry", () => {
  const today = new Date(2026, 8, 26); // Sep 26, 2026, local time

  it("is null for a perk with no expiry", () => {
    expect(formatExpiry(null, today)).toBeNull();
  });

  it("counts calendar days, then weeks, then shows the date", () => {
    expect(formatExpiry("2026-09-25", today)).toBe("Expired");
    expect(formatExpiry("2026-09-26", today)).toBe("Expires today");
    expect(formatExpiry("2026-09-27", today)).toBe("Expires tomorrow");
    expect(formatExpiry("2026-10-06", today)).toBe("Expires in 10 days");
    expect(formatExpiry("2026-10-17", today)).toBe("Expires in 3 weeks");
    expect(formatExpiry("2027-03-01", today)).toBe("Expires Mar 1");
  });
});

describe("perkLocationLabel", () => {
  it("prefers the neighborhood, then the area, else nothing", () => {
    expect(perkLocationLabel([{ neighborhood: "Jordaan", area: "Center" }])).toBe("Jordaan");
    expect(perkLocationLabel([{ neighborhood: " ", area: "West" }])).toBe("West");
    expect(perkLocationLabel([{ neighborhood: null, area: null }])).toBeNull();
    expect(perkLocationLabel([])).toBeNull();
  });

  it("joins multiple locations, comma-separated", () => {
    expect(
      perkLocationLabel([
        { neighborhood: "Jordaan", area: null },
        { neighborhood: null, area: "West" },
      ]),
    ).toBe("Jordaan, West");
  });

  it("caps named locations and folds the rest into '+N more'", () => {
    expect(
      perkLocationLabel([
        { neighborhood: "Jordaan", area: null },
        { neighborhood: "West", area: null },
        { neighborhood: "Center", area: null },
        { neighborhood: "East", area: null },
      ]),
    ).toBe("Jordaan, West +2 more");
  });

  it("skips locations with neither neighborhood nor area when joining", () => {
    expect(
      perkLocationLabel([
        { neighborhood: "Jordaan", area: null },
        { neighborhood: null, area: null },
      ]),
    ).toBe("Jordaan");
  });

  it("shows 'Online' for an online perk with no locations", () => {
    expect(perkLocationLabel([], true)).toBe("Online");
    expect(perkLocationLabel([{ neighborhood: null, area: null }], true)).toBe("Online");
  });

  it("combines Online with a location label when a perk has both", () => {
    expect(perkLocationLabel([{ neighborhood: "Jordaan", area: "Center" }], true)).toBe("Online, Jordaan");
  });

  it("is not online by default", () => {
    expect(perkLocationLabel([{ neighborhood: "Jordaan", area: "Center" }])).toBe("Jordaan");
    expect(perkLocationLabel([{ neighborhood: "Jordaan", area: "Center" }], false)).toBe("Jordaan");
  });
});
