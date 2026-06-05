"use server";

import { createAdminClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { currentMonth, monthToDate } from "@/lib/skip-token";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanBreakdown = { label: string; count: number }[];

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

