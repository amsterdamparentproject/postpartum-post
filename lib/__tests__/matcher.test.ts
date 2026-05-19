/**
 * Matcher test suite — 10 scenarios
 *
 * Tests are organized around the exported pure functions (matchTypeCompatible,
 * scorePair) and the async orchestrator (runMatcher).  No network calls are
 * made — proximity is exercised by injecting a pre-computed coordMap, and the
 * Supabase client is replaced with a lightweight inline stub.
 *
 * Weight constants mirror the private W object in lib/matcher.ts:
 *   LANGUAGE: 1000  |  AVAILABILITY: 500  |  TOPIC: 250
 *   PRIORITY_HIGH: 100  |  PRIORITY_LOW: 50  |  MID: 75
 */

import { describe, it, expect } from "vitest";
import {
  matchTypeCompatible,
  scorePair,
  runMatcher,
  type MatchCandidate,
} from "@/lib/matcher";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Builds a MatchCandidate with every optional field null unless overridden. */
function member(
  overrides: Partial<MatchCandidate> & { id: string }
): MatchCandidate {
  return {
    first_name: "Test",
    last_name: "Member",
    email: `${overrides.id}@test.com`,
    zipcode: null,
    lat: null,
    lng: null,
    topic_id: null,
    language: null as string[] | null,
    match_type: null,
    availability: null,
    match_priority: null,
    children: null,
    ...overrides,
  };
}

/** Coord map with no entries — proximity scores 0 for every pair. */
const NO_COORDS = new Map<string, { lat: number; lng: number }>();

/**
 * Minimal Supabase stub for runMatcher.
 * runMatcher only reads from the matches table (via getRecentlyMatchedPairs).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSupabase(recentRows: { member_id_1: string; member_id_2: string }[] = []): any {
  return {
    from: () => ({
      select: () => ({
        gte: () => Promise.resolve({ data: recentRows, error: null }),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 — Language scoring
// ---------------------------------------------------------------------------

describe("Scenario 1: Language scoring", () => {
  it("awards 1000pts when both members share at least one language", () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] });
    expect(scorePair(a, b, NO_COORDS).breakdown.language).toBe(1000);
  });

  it("awards 1000pts when a bilingual member shares one language with a monolingual member", () => {
    const a = member({ id: "a", language: ["english", "dutch"] });
    const b = member({ id: "b", language: ["dutch"] });
    expect(scorePair(a, b, NO_COORDS).breakdown.language).toBe(1000);
  });

  it("awards 0pts when the two language lists have no overlap", () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["dutch"] });
    expect(scorePair(a, b, NO_COORDS).breakdown.language).toBe(0);
  });

  it("awards 0pts when either member has no language preference (null or empty)", () => {
    const a = member({ id: "a", language: ["english"] });
    const noLang = member({ id: "b", language: null });
    const emptyLang = member({ id: "c", language: [] });
    expect(scorePair(a, noLang, NO_COORDS).breakdown.language).toBe(0);
    expect(scorePair(a, emptyLang, NO_COORDS).breakdown.language).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — match_type conflict → hard exclusion
// ---------------------------------------------------------------------------

describe("Scenario 2: match_type conflict is a hard exclusion", () => {
  it("matchTypeCompatible returns false when both preferences are set but conflict", () => {
    const inPerson = member({ id: "a", match_type: "in_person" });
    const online = member({ id: "b", match_type: "online" });
    expect(matchTypeCompatible(inPerson, online)).toBe(false);
  });

  it("runMatcher never pairs members with conflicting match_type", async () => {
    const a = member({ id: "a", language: ["english"], match_type: "in_person" });
    const b = member({ id: "b", language: ["english"], match_type: "online" });
    const { matched, unmatched } = await runMatcher([a, b], mockSupabase(), NO_COORDS);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — match_type null → compatible with any preference
// ---------------------------------------------------------------------------

describe("Scenario 3: null match_type is compatible with anything", () => {
  it("is compatible when one has a preference and the other has null", () => {
    const inPerson = member({ id: "a", match_type: "in_person" });
    const noPreference = member({ id: "b", match_type: null });
    expect(matchTypeCompatible(inPerson, noPreference)).toBe(true);
    expect(matchTypeCompatible(noPreference, inPerson)).toBe(true);
  });

  it("is compatible when both have null", () => {
    const a = member({ id: "a", match_type: null });
    const b = member({ id: "b", match_type: null });
    expect(matchTypeCompatible(a, b)).toBe(true);
  });

  it("resolves matchType on the pair to the shared value when both agree", () => {
    const a = member({ id: "a", match_type: "online" });
    const b = member({ id: "b", match_type: "online" });
    const pair = scorePair(a, b, NO_COORDS);
    expect(pair.matchType).toBe("online");
  });

  it("resolves matchType to null when preferences differ or either is null", () => {
    const a = member({ id: "a", match_type: "in_person" });
    const b = member({ id: "b", match_type: null });
    expect(scorePair(a, b, NO_COORDS).matchType).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Availability Jaccard similarity
// ---------------------------------------------------------------------------

describe("Scenario 4: Availability Jaccard similarity scales score", () => {
  const baseAvailability = {
    days: ["monday", "tuesday", "wednesday", "thursday"],
    times: ["morning", "afternoon"],
  };

  it("scores high overlap pair at 400pts (Jaccard days=0.6, times=1.0)", () => {
    // Shares mon/tue/wed (3) but not thu; B adds fri. Union=5. J=3/5=0.6
    // Times fully identical. J=1.0. Score = (0.6+1.0)/2 * 500 = 400
    const a = member({ id: "a", availability: baseAvailability });
    const b = member({
      id: "b",
      availability: {
        days: ["monday", "tuesday", "wednesday", "friday"],
        times: ["morning", "afternoon"],
      },
    });
    expect(scorePair(a, b, NO_COORDS).breakdown.availability).toBe(400);
  });

  it("scores zero overlap pair at 0pts", () => {
    const a = member({ id: "a", availability: baseAvailability });
    const c = member({
      id: "c",
      availability: { days: ["friday"], times: ["evening"] },
    });
    expect(scorePair(a, c, NO_COORDS).breakdown.availability).toBe(0);
  });

  it("high-overlap pair availability score exceeds low-overlap pair", () => {
    const a = member({ id: "a", availability: baseAvailability });
    const b = member({
      id: "b",
      availability: {
        days: ["monday", "tuesday", "wednesday", "friday"],
        times: ["morning", "afternoon"],
      },
    });
    const c = member({
      id: "c",
      availability: { days: ["friday"], times: ["evening"] },
    });
    expect(scorePair(a, b, NO_COORDS).breakdown.availability).toBeGreaterThan(
      scorePair(a, c, NO_COORDS).breakdown.availability
    );
  });

  it("awards 0pts when either member has no availability set", () => {
    const a = member({ id: "a", availability: baseAvailability });
    const b = member({ id: "b", availability: null });
    expect(scorePair(a, b, NO_COORDS).breakdown.availability).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Topic scoring
// ---------------------------------------------------------------------------

describe("Scenario 5: Topic scoring", () => {
  const TOPIC_A = "topic-uuid-1111";
  const TOPIC_B = "topic-uuid-2222";

  it("awards 250pts when both members share the same topic", () => {
    const a = member({ id: "a", topic_id: TOPIC_A });
    const b = member({ id: "b", topic_id: TOPIC_A });
    expect(scorePair(a, b, NO_COORDS).breakdown.topic).toBe(250);
  });

  it("awards 0pts when both have different topics", () => {
    const a = member({ id: "a", topic_id: TOPIC_A });
    const b = member({ id: "b", topic_id: TOPIC_B });
    expect(scorePair(a, b, NO_COORDS).breakdown.topic).toBe(0);
  });

  it("awards 0pts when either topic is null (no preference)", () => {
    const a = member({ id: "a", topic_id: TOPIC_A });
    const b = member({ id: "b", topic_id: null });
    expect(scorePair(a, b, NO_COORDS).breakdown.topic).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — match_priority='proximity' weights proximity over children
// ---------------------------------------------------------------------------

describe("Scenario 6: match_priority='proximity' upweights proximity over children", () => {
  // A is at Amsterdam Centraal, B is ~5 km north.
  // rawProximity ≈ 1 - 5/15 ≈ 0.667 → breakdown.proximity ≈ 66.7 (× 100)
  // Children have a 12-month gap → rawChildren = 0.5 → breakdown.children = 25 (× 50)
  const coordMap = new Map([
    ["a", { lat: 52.3676, lng: 4.9041 }],
    ["b", { lat: 52.4126, lng: 4.9041 }], // ~5 km north
  ]);

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const pastDate = new Date(now);
  pastDate.setMonth(pastDate.getMonth() - 12);
  const pastMonth = pastDate.getMonth() + 1;
  const pastYear = pastDate.getFullYear();

  it("proximity breakdown exceeds children breakdown when both prefer proximity", () => {
    const a = member({
      id: "a",
      zipcode: "1012",
      lat: 52.3676,
      lng: 4.9041,
      match_priority: "proximity",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const b = member({
      id: "b",
      zipcode: "1013",
      lat: 52.4126,
      lng: 4.9041,
      match_priority: "proximity",
      children: [{ birth_month: pastMonth, birth_year: pastYear, expected: false }],
    });
    const { breakdown } = scorePair(a, b, coordMap);
    expect(breakdown.proximity).toBeGreaterThan(breakdown.children);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 — match_priority='age' weights children over proximity
// ---------------------------------------------------------------------------

describe("Scenario 7: match_priority='age' upweights children over proximity", () => {
  const coordMap = new Map([
    ["a", { lat: 52.3676, lng: 4.9041 }],
    ["b", { lat: 52.4126, lng: 4.9041 }],
  ]);

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  const pastDate = new Date(now);
  pastDate.setMonth(pastDate.getMonth() - 12);
  const pastMonth = pastDate.getMonth() + 1;
  const pastYear = pastDate.getFullYear();

  it("children breakdown exceeds proximity breakdown when both prefer age", () => {
    const a = member({
      id: "a",
      zipcode: "1012",
      lat: 52.3676,
      lng: 4.9041,
      match_priority: "age",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const b = member({
      id: "b",
      zipcode: "1013",
      lat: 52.4126,
      lng: 4.9041,
      match_priority: "age",
      children: [{ birth_month: pastMonth, birth_year: pastYear, expected: false }],
    });
    const { breakdown } = scorePair(a, b, coordMap);
    expect(breakdown.children).toBeGreaterThan(breakdown.proximity);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 — Children age gap scoring
// ---------------------------------------------------------------------------

describe("Scenario 8: Children age gap scoring", () => {
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  // A child born 25 months ago
  const farPast = new Date(now);
  farPast.setMonth(farPast.getMonth() - 25);
  const farPastMonth = farPast.getMonth() + 1;
  const farPastYear = farPast.getFullYear();

  it("scores near-maximum when both members have same-month children (gap = 0)", () => {
    const a = member({
      id: "a",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const b = member({
      id: "b",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    // gap=0 → rawScore=1.0; mid weight=75 → breakdown.children = 75
    expect(scorePair(a, b, NO_COORDS).breakdown.children).toBe(75);
  });

  it("scores 0 when the closest child pair is 25+ months apart", () => {
    const a = member({
      id: "a",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const b = member({
      id: "b",
      children: [{ birth_month: farPastMonth, birth_year: farPastYear, expected: false }],
    });
    // gap=25 months >= MAX(24) → rawScore=0 → breakdown.children = 0
    expect(scorePair(a, b, NO_COORDS).breakdown.children).toBe(0);
  });

  it("scores 0 when either member has no children set", () => {
    const a = member({
      id: "a",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const b = member({ id: "b", children: null });
    expect(scorePair(a, b, NO_COORDS).breakdown.children).toBe(0);
  });

  it("treats expected children as younger than same-month newborns (due date used as age)", () => {
    // Due next month → age ≈ −1. Newborn → age ≈ 0. Gap = 1 month.
    // rawScore = 1 − 1/24 ≈ 0.958. × 75 ≈ 71.9 — high but slightly below 75.
    const nextMonth = curMonth === 12 ? 1 : curMonth + 1;
    const nextMonthYear = curMonth === 12 ? curYear + 1 : curYear;
    const a = member({
      id: "a",
      children: [{ birth_month: nextMonth, birth_year: nextMonthYear, expected: true }],
    });
    const b = member({
      id: "b",
      children: [{ birth_month: curMonth, birth_year: curYear, expected: false }],
    });
    const score = scorePair(a, b, NO_COORDS).breakdown.children;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(75); // slightly penalised vs same-month
  });

  it("ranks two pregnant members with close due dates higher than those with distant due dates", () => {
    // Close pair: both due next month → gap = 0 → score = 75
    const nextMonth = curMonth === 12 ? 1 : curMonth + 1;
    const nextMonthYear = curMonth === 12 ? curYear + 1 : curYear;

    // Distant pair: one due next month, one due in 7 months → gap = 6 months
    const farDate = new Date(now);
    farDate.setMonth(farDate.getMonth() + 7);
    const farMonth = farDate.getMonth() + 1;
    const farYear = farDate.getFullYear();

    const dueSoon1 = member({
      id: "ds1",
      children: [{ birth_month: nextMonth, birth_year: nextMonthYear, expected: true }],
    });
    const dueSoon2 = member({
      id: "ds2",
      children: [{ birth_month: nextMonth, birth_year: nextMonthYear, expected: true }],
    });
    const dueLater = member({
      id: "dl",
      children: [{ birth_month: farMonth, birth_year: farYear, expected: true }],
    });

    const closePairScore = scorePair(dueSoon1, dueSoon2, NO_COORDS).breakdown.children;
    const distantPairScore = scorePair(dueSoon1, dueLater, NO_COORDS).breakdown.children;

    expect(closePairScore).toBeGreaterThan(distantPairScore);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9 — 6-month window excludes recently matched pairs
// ---------------------------------------------------------------------------

describe("Scenario 9: 6-month window excludes recently matched pairs", () => {
  it("does not pair two members who were matched within the last 6 months", async () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] }); // perfect match otherwise
    const supabase = mockSupabase([{ member_id_1: "a", member_id_2: "b" }]);
    const { matched, unmatched } = await runMatcher([a, b], supabase, NO_COORDS);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(2);
  });

  it("still pairs other members even when one pair is excluded", async () => {
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] }); // excluded with A
    const c = member({ id: "c", language: ["english"] });
    const d = member({ id: "d", language: ["english"] });
    // A+B are recently matched. All 4 share a language so A→C/D and B→C/D
    // are still valid. The A+B pair itself should never appear in results.
    const supabase = mockSupabase([{ member_id_1: "a", member_id_2: "b" }]);
    const { matched } = await runMatcher([a, b, c, d], supabase, NO_COORDS);

    // A+B should never be paired together
    const abPair = matched.find(
      (p) =>
        (p.a.id === "a" && p.b.id === "b") ||
        (p.a.id === "b" && p.b.id === "a")
    );
    expect(abPair).toBeUndefined();

    // The other 4-way matchable pool should result in 2 pairs
    expect(matched).toHaveLength(2);
    const matchedIds = matched.flatMap((p) => [p.a.id, p.b.id]);
    expect(matchedIds).toContain("c");
    expect(matchedIds).toContain("d");
  });
});

// ---------------------------------------------------------------------------
// Scenario 10 — Greedy algorithm picks highest-score pair first
// ---------------------------------------------------------------------------

describe("Scenario 10: Greedy algorithm assigns highest-score pair first", () => {
  it("picks the best scoring pair, leaving the third member unmatched", async () => {
    // score(A, B) = 1000 — shared language
    // score(A, C) = 400  — shared availability
    // score(B, C) = 0    — nothing in common
    const a = member({
      id: "a",
      language: ["english"],
      availability: { days: ["monday", "tuesday", "wednesday", "thursday"], times: ["morning", "afternoon"] },
    });
    const b = member({
      id: "b",
      language: ["english"],
      // no availability → availability score with A = 0
    });
    const c = member({
      id: "c",
      language: ["dutch"],
      availability: {
        days: ["monday", "tuesday", "wednesday", "friday"],
        times: ["morning", "afternoon"],
      },
    });

    const { matched, unmatched } = await runMatcher(
      [a, b, c],
      mockSupabase(),
      NO_COORDS
    );

    // A+B should win (language=1000 beats availability=400)
    expect(matched).toHaveLength(1);
    const pairedIds = [matched[0].a.id, matched[0].b.id];
    expect(pairedIds).toContain("a");
    expect(pairedIds).toContain("b");

    // C is left without a partner
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].id).toBe("c");
  });

  it("correctly pairs four members into two optimal pairs", async () => {
    // A↔B: 1000 (language English), C↔D: 1000 (language Dutch)
    // All cross pairs: 0
    const a = member({ id: "a", language: ["english"] });
    const b = member({ id: "b", language: ["english"] });
    const c = member({ id: "c", language: ["dutch"] });
    const d = member({ id: "d", language: ["dutch"] });

    const { matched, unmatched } = await runMatcher(
      [a, b, c, d],
      mockSupabase(),
      NO_COORDS
    );

    expect(matched).toHaveLength(2);
    expect(unmatched).toHaveLength(0);

    const pairA = matched.find(
      (p) => p.a.id === "a" || p.b.id === "a"
    )!;
    const pairC = matched.find(
      (p) => p.a.id === "c" || p.b.id === "c"
    )!;

    expect([pairA.a.id, pairA.b.id]).toContain("b");
    expect([pairC.a.id, pairC.b.id]).toContain("d");
  });
});
