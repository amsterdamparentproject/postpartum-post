"use server";

import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { currentMonth, monthToDate } from "@/lib/tokens";
import { ENABLE_TIME_OF_DAY } from "@/lib/flags";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanBreakdown = { label: string; count: number }[];

export type MemberLocation = {
  lat: number;
  lng: number;
  name: string;
  parentType: string;
  zipcode: string | null;
  childLabels: string[];
  availabilityLabel: string;
};

export type AgeBucket = { label: string; count: number; expected?: true };

export type AvailabilityCount = { label: string; count: number };

export type DemographicStats = {
  locations: MemberLocation[];
  ageBuckets: AgeBucket[];
  availabilityDays: AvailabilityCount[];
  parentTypes: AvailabilityCount[];
};

export type BaseStats = {
  totalActive: number;
  newThisMonth: number;
  momPercent: number | null;
  planBreakdown: PlanBreakdown;
};

export type RevenueMonth = { month: string; label: string; amountCents: number };

export type MatchRoundStats = {
  month: string;
  totalActive: number;
  optedIn: number;
  coffee: number;
  playdate: number;
  skipped: number;
  noResponse: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAN_LABELS: Record<string, string> = {
  founding_member: "Founding Member",
  standard_monthly: "Standard Monthly",
  commitment_3mo: "3-Month",
};


// ---------------------------------------------------------------------------
// getBaseStats
// ---------------------------------------------------------------------------

export async function getBaseStats(): Promise<BaseStats> {
  const supabase = createAdminClient();
  const stripe = getStripe();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [{ count: totalActive }, { count: newThisMonth }, { data: activeMembers }, prices] =
    await Promise.all([
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .gte("created_at", monthStart),
      supabase
        .from("members")
        .select("id")
        .eq("status", "active"),
      stripe.prices.list({ limit: 100 }),
    ]);

  // Fetch the most recent subscription for each active member
  const activeMemberIds = (activeMembers ?? []).map((m) => m.id);
  const { data: subs } = activeMemberIds.length
    ? await supabase
        .from("subscriptions")
        .select("member_id, stripe_price_id, created_at")
        .in("member_id", activeMemberIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Build price ID → readable label map
  const priceToLabel = new Map<string, string>();
  for (const price of prices.data) {
    const key = price.lookup_key ?? "";
    priceToLabel.set(price.id, PLAN_LABELS[key] ?? key);
  }

  // One subscription per member (most recent), then count per plan
  const seenMembers = new Set<string>();
  const planCounts = new Map<string, number>();
  for (const sub of subs ?? []) {
    if (seenMembers.has(sub.member_id)) continue;
    seenMembers.add(sub.member_id);
    const label = priceToLabel.get(sub.stripe_price_id) ?? "Unknown";
    planCounts.set(label, (planCounts.get(label) ?? 0) + 1);
  }

  const planBreakdown: PlanBreakdown = [...planCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const active = totalActive ?? 0;
  const newN = newThisMonth ?? 0;
  const prev = active - newN;
  const momPercent = prev > 0 ? Math.round((newN / prev) * 100) : null;

  return { totalActive: active, newThisMonth: newN, momPercent, planBreakdown };
}

// ---------------------------------------------------------------------------
// getMonthlyRevenue
// ---------------------------------------------------------------------------

export async function getMonthlyRevenue(): Promise<RevenueMonth[]> {
  const supabase = createAdminClient();
  const stripe = getStripe();
  const twelveMonthsAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;

  // All price IDs ever used for Post subscriptions (including cancelled)
  const { data: allSubs } = await supabase
    .from("subscriptions")
    .select("stripe_price_id");
  const postPriceIds = new Set((allSubs ?? []).map((s) => s.stripe_price_id));

  const invoices = await stripe.invoices.list({
    status: "paid",
    created: { gte: twelveMonthsAgo },
    limit: 100,
    expand: ["data.lines"],
  });

  const revenueByMonth: Record<string, number> = {};
  for (const inv of invoices.data) {
    const isPost = inv.lines.data.some((line) => {
      const p = line.pricing?.price_details?.price;
      const priceId = typeof p === "string" ? p : p?.id;
      return priceId != null && postPriceIds.has(priceId);
    });
    if (!isPost) continue;
    const month = new Date(inv.created * 1000).toISOString().slice(0, 7);
    revenueByMonth[month] = (revenueByMonth[month] ?? 0) + (inv.amount_paid ?? 0);
  }

  // Build the last 12 months in order, filling gaps with 0
  const months: RevenueMonth[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    months.push({
      month: key,
      label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      amountCents: revenueByMonth[key] ?? 0,
    });
  }

  return months;
}

// ---------------------------------------------------------------------------
// getMatchRoundStats
// ---------------------------------------------------------------------------

export async function getMatchRoundStats(): Promise<MatchRoundStats> {
  const supabase = createAdminClient();
  const monthStr = currentMonth();
  const monthDate = monthToDate(monthStr);

  const [{ count: totalActive }, { data: participations }, { count: skipped }] =
    await Promise.all([
      supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("monthly_participation")
        .select("topic_id, topics ( name )")
        .eq("month", monthDate),
      supabase
        .from("monthly_skips")
        .select("*", { count: "exact", head: true })
        .eq("month", monthDate),
    ]);

  const active = totalActive ?? 0;
  const optedIn = participations?.length ?? 0;
  const coffee = (participations ?? []).filter(
    (p) => (p.topics as unknown as { name: string } | null)?.name === "coffee"
  ).length;
  const playdate = (participations ?? []).filter(
    (p) => (p.topics as unknown as { name: string } | null)?.name === "playdate"
  ).length;
  const skippedN = skipped ?? 0;
  const noResponse = Math.max(0, active - optedIn - skippedN);

  return { month: monthStr, totalActive: active, optedIn, coffee, playdate, skipped: skippedN, noResponse };
}

// ---------------------------------------------------------------------------
// getDemographicStats
// ---------------------------------------------------------------------------

type ChildEntry = { birth_month?: number; birth_year?: number; expected?: boolean };
type Availability = { days?: string[]; times?: string[] };

const PARENT_TYPE_ORDER = ["mom", "dad", "anyone"];
const PARENT_TYPE_LABELS: Record<string, string> = { mom: "Moms", dad: "Dads", anyone: "Anyone" };

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

const AGE_BUCKETS: { label: string; minMonths: number; maxMonths: number }[] = [
  { label: "0–3 mo",  minMonths: 0,   maxMonths: 3   },
  { label: "3–6 mo",  minMonths: 3,   maxMonths: 6   },
  { label: "6–12 mo", minMonths: 6,   maxMonths: 12  },
  { label: "1–2 yr",  minMonths: 12,  maxMonths: 24  },
  { label: "2–3 yr",  minMonths: 24,  maxMonths: 36  },
  { label: "3–4 yr",  minMonths: 36,  maxMonths: 48  },
  { label: "4–5 yr",  minMonths: 48,  maxMonths: 60  },
  { label: "5+ yr",   minMonths: 60,  maxMonths: Infinity },
];

const TIME_LABELS: Record<string, string> = { morning: "mornings", afternoon: "afternoons" };

function buildAvailabilityLabel(avail: Availability): string {
  const days = (avail.days ?? []).map((d) => DAY_LABELS[d] ?? d).join(", ");
  const times = ENABLE_TIME_OF_DAY
    ? (avail.times ?? []).map((t) => TIME_LABELS[t] ?? t).join(" & ")
    : "";
  if (!days && !times) return "Not set";
  if (days && times) return `${days} · ${times}`;
  return days || times;
}

export async function getDemographicStats(): Promise<DemographicStats> {
  const supabase = createAdminClient();

  const { data: members } = await supabase
    .from("members")
    .select("lat, lng, children, availability, parent_type, first_name, last_name, zipcode")
    .eq("status", "active");

  const locations: MemberLocation[] = [];
  const ageCounts = new Array<number>(AGE_BUCKETS.length).fill(0);
  let expectedCount = 0;
  const dayCounts: Record<string, number> = Object.fromEntries(DAY_ORDER.map((d) => [d, 0]));
  const parentTypeCounts: Record<string, number> = Object.fromEntries(PARENT_TYPE_ORDER.map((t) => [t, 0]));

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1; // 1-indexed

  for (const member of members ?? []) {
    const children: ChildEntry[] = Array.isArray(member.children) ? member.children : [];

    if (member.lat != null && member.lng != null) {
      const childLabels = children.map((c) => {
        if (c.expected) return "Expecting";
        if (c.birth_year == null || c.birth_month == null) return null;
        const ageMonths = (nowYear - c.birth_year) * 12 + (nowMonth - c.birth_month);
        return ageMonths < 12 ? `${ageMonths} mo` : `${Math.floor(ageMonths / 12)} yr`;
      }).filter((l): l is string => l !== null);

      locations.push({
        lat: member.lat,
        lng: member.lng,
        name: [member.first_name, member.last_name].filter(Boolean).join(" ") || "Unknown",
        parentType: ({ mom: "Mom", dad: "Dad", anyone: "Anyone" } as Record<string, string>)[member.parent_type ?? ""] ?? "—",
        zipcode: member.zipcode ?? null,
        childLabels,
        availabilityLabel: buildAvailabilityLabel((member.availability ?? {}) as Availability),
      });
    }
    for (const child of children) {
      if (child.expected) { expectedCount++; continue; }
      if (child.birth_year == null || child.birth_month == null) continue;
      const ageMonths = (nowYear - child.birth_year) * 12 + (nowMonth - child.birth_month);
      const idx = AGE_BUCKETS.findIndex((b) => ageMonths >= b.minMonths && ageMonths < b.maxMonths);
      if (idx !== -1) ageCounts[idx]++;
    }

    const avail = (member.availability ?? {}) as Availability;
    for (const day of avail.days ?? []) if (day in dayCounts) dayCounts[day]++;

    const pt = member.parent_type;
    if (pt && pt in parentTypeCounts) parentTypeCounts[pt]++;
  }

  const ageBuckets: AgeBucket[] = AGE_BUCKETS.map((b, i) => ({ label: b.label, count: ageCounts[i] }));
  if (expectedCount > 0) ageBuckets.push({ label: "Expected", count: expectedCount, expected: true });

  const availabilityDays: AvailabilityCount[] = DAY_ORDER.map((d) => ({ label: DAY_LABELS[d], count: dayCounts[d] }));
  const parentTypes: AvailabilityCount[] = PARENT_TYPE_ORDER.map((t) => ({ label: PARENT_TYPE_LABELS[t], count: parentTypeCounts[t] }));

  return { locations, ageBuckets, availabilityDays, parentTypes };
}

