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
  it("ranks featured, live, redeemed, monthly, exclusive, viewed, newest", () => {
    expect(
      order([
        perk("oldest"),
        perk("newest", { created_at: "2026-09-20T00:00:00Z" }),
        perk("viewed", { viewed_count: 3 }),
        perk("exclusive", { exclusive: true }),
        perk("intro", { frequency: "once" }),
        perk("redeemed", { redeemed_count: 1 }),
        perk("soon", { status: "coming_soon", redeemed_count: 99 }),
        perk("featured", { featured: true }),
      ]),
    ).toEqual(["featured", "redeemed", "exclusive", "viewed", "newest", "oldest", "intro", "soon"]);
  });

  it("a live, well-redeemed perk beats an exclusive intro offer", () => {
    expect(
      order([
        perk("exclusive-intro", { frequency: "once", exclusive: true }),
        perk("redeemed-monthly", { redeemed_count: 2 }),
      ]),
    ).toEqual(["redeemed-monthly", "exclusive-intro"]);
  });

  it("a well-redeemed intro offer beats a barely-viewed monthly perk", () => {
    expect(
      order([
        perk("monthly-viewed", { viewed_count: 1 }),
        perk("intro-redeemed", { frequency: "once", redeemed_count: 3 }),
      ]),
    ).toEqual(["intro-redeemed", "monthly-viewed"]);
  });

  it("with equal redemptions, monthly comes before an intro offer, even an exclusive or viewed one", () => {
    expect(
      order([
        perk("intro", { frequency: "once", exclusive: true, viewed_count: 9 }),
        perk("monthly"),
      ]),
    ).toEqual(["monthly", "intro"]);
  });

  it("a featured intro offer leads everything, featured monthly first among featured", () => {
    expect(
      order([
        perk("monthly", { redeemed_count: 5 }),
        perk("intro-featured", { frequency: "once", featured: true }),
        perk("monthly-featured", { featured: true }),
      ]),
    ).toEqual(["monthly-featured", "intro-featured", "monthly"]);
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
