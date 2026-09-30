import { describe, it, expect } from "vitest";
import { comparePerks, countEventsByPerk, type RankablePerk } from "@/lib/perk-ranking";

function perk(name: string, overrides: Partial<RankablePerk> = {}): RankablePerk & { name: string } {
  return {
    name,
    status: "published",
    featured: false,
    exclusive: false,
    frequency: "monthly",
    created_at: "2026-09-01T00:00:00Z",
    redeemed_count: 0,
    viewed_count: 0,
    ...overrides,
  };
}

const order = (perks: ReturnType<typeof perk>[]) => [...perks].sort(comparePerks).map((p) => p.name);

describe("comparePerks", () => {
  it("ranks live, then redeemed, viewed, featured, exclusive, newest", () => {
    expect(
      order([
        perk("soon", { status: "coming_soon", redeemed_count: 99 }),
        perk("newest", { created_at: "2026-09-20T00:00:00Z" }),
        perk("exclusive", { exclusive: true }),
        perk("featured", { featured: true }),
        perk("viewed", { viewed_count: 3 }),
        perk("redeemed", { redeemed_count: 1 }),
        perk("oldest"),
      ]),
    ).toEqual(["redeemed", "viewed", "featured", "exclusive", "newest", "oldest", "soon"]);
  });
});

describe("comparePerks: monthly vs intro offers", () => {
  it("puts monthly perks before intro offers, even more popular ones", () => {
    expect(
      order([
        perk("intro-popular", { frequency: "once", redeemed_count: 9, featured: true }),
        perk("monthly-plain"),
        perk("monthly-viewed", { viewed_count: 2 }),
        perk("soon", { status: "coming_soon" }),
      ]),
    ).toEqual(["monthly-viewed", "monthly-plain", "intro-popular", "soon"]);
  });
});

describe("countEventsByPerk", () => {
  it("counts each member once per perk and event type", () => {
    const counts = countEventsByPerk([
      { perk_id: "a", member_id: "m1", event_type: "viewed" },
      { perk_id: "a", member_id: "m1", event_type: "viewed" },
      { perk_id: "a", member_id: "m2", event_type: "viewed" },
      { perk_id: "a", member_id: "m1", event_type: "redeemed" },
      { perk_id: "b", member_id: "m3", event_type: "viewed" },
    ]);
    expect(counts.get("a")).toEqual({ redeemed_count: 1, viewed_count: 2 });
    expect(counts.get("b")).toEqual({ redeemed_count: 0, viewed_count: 1 });
  });
});
