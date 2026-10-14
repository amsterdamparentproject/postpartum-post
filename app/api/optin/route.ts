import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyOptinToken, type OptinAction } from "@/lib/optin-token";
import { monthToDate } from "@/lib/tokens";
import { generateMagicLinkWithRetry } from "@/lib/supabase/generate-magic-link";
import { debitLatePerksIfRoundCommitted } from "@/lib/match-ledger";
import { resolveCohortOnly } from "@/lib/cohort";
import { hasPerksAccess } from "@/lib/billing-mode";

/**
 * GET /api/optin?member={memberId}&month={YYYY-MM}&action={coffee|playdate|skip}&token={hmac}
 *
 * One-click opt-in link included in the 1st-of-month email.
 * Validates the HMAC token, records the member's choice, then generates a
 * Supabase magic link so the member is signed in automatically when they land
 * on /profile — no separate sign-in step required.
 *
 * Falls back to a plain /profile redirect if magic link generation fails.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const memberId = searchParams.get("member");
  const month = searchParams.get("month");
  const action = searchParams.get("action") as OptinAction | null;

  if (
    !memberId ||
    !month ||
    !action ||
    !["coffee", "playdate", "perks", "skip"].includes(action)
  ) {
    return NextResponse.redirect(`${origin}/`);
  }

  const token = searchParams.get("token");
  if (!token || !verifyOptinToken(memberId, month, action, token)) {
    return NextResponse.redirect(`${origin}/`);
  }

  const supabase = createAdminClient();

  // Fetch member email (needed for magic link generation)
  const { data: memberRow } = await supabase
    .from("members")
    .select("email, consecutive_skips, matches_remaining, billing_mode")
    .eq("id", memberId)
    .single();

  if (!memberRow) {
    return NextResponse.redirect(`${origin}/`);
  }

  // -------------------------------------------------------------------------
  // Record the action
  // -------------------------------------------------------------------------

  if (action === "skip") {
    const monthDate = monthToDate(month);

    const { data: existing } = await supabase
      .from("monthly_skips")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle();

    if (existing) {
      return signInAndRedirect(supabase, memberRow.email, `${origin}/billing?optin=already_skip`, origin);
    }

    const { error: skipError } = await supabase
      .from("monthly_skips")
      .insert({ member_id: memberId, month: monthDate });

    if (skipError) {
      console.error("[optin] Failed to record skip:", skipError);
      // Loud failure (Track C5): a silent redirect to "/" here would leave the
      // member thinking their skip went through when it didn't — they'd be
      // billed/matched as if they'd done nothing. Send them to /billing with
      // a visible error banner instead so they know to retry or contact us.
      return signInAndRedirect(supabase, memberRow.email, `${origin}/billing?optin=skip_failed`, origin);
    }

    // Remove any existing participation row so they're not included in the match run
    await supabase
      .from("monthly_participation")
      .delete()
      .eq("member_id", memberId)
      .eq("month", monthDate);

    await supabase
      .from("members")
      .update({ consecutive_skips: memberRow.consecutive_skips + 1 })
      .eq("id", memberId);

    return signInAndRedirect(supabase, memberRow.email, `${origin}/billing?optin=skip`, origin);
  }

  // coffee, playdate, or perks
  // Track E3: gate on the counter — a member with nothing left to spend
  // isn't enrolled in the round (they still get the opt-in email; the gate
  // is only at the click). Skipping stays free regardless of balance, so
  // this check only applies here, not in the "skip" branch above.
  // perks-only consumes a credit exactly like a real match (commit-matches
  // records a 'perks_only' entitlement event for it) -- same gate.
  if ((memberRow.matches_remaining ?? 0) <= 0) {
    return signInAndRedirect(supabase, memberRow.email, `${origin}/billing?optin=no_balance`, origin);
  }

  const monthDate = monthToDate(month);

  // A member who already skipped this month can still change their mind to
  // coffee/playdate/perks -- clear the stale skip row so it can't
  // double-count as both "skipped" and "opted in" (admin stats reads
  // monthly_skips' row count directly).
  await supabase
    .from("monthly_skips")
    .delete()
    .eq("member_id", memberId)
    .eq("month", monthDate);

  // A real answer (matched or perks-only) is final for the month -- unlike
  // a skip, it isn't overridden by clicking a different link from the same
  // original email. Rare in practice (two different one-click links from
  // the same still-valid email), so this just lands them back on /profile
  // rather than needing its own banner copy.
  if (action === "perks") {
    // Comped members without Perks can't take the perks-only choice.
    if (!hasPerksAccess(memberRow.billing_mode)) {
      return signInAndRedirect(supabase, memberRow.email, `${origin}/matches`, origin);
    }
    const { data: existingParticipation } = await supabase
      .from("monthly_participation")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle();
    if (existingParticipation) {
      return signInAndRedirect(supabase, memberRow.email, `${origin}/profile`, origin);
    }

    const { error: perksError } = await supabase
      .from("monthly_perks")
      .insert({ member_id: memberId, month: monthDate });

    if (perksError && perksError.code !== "23505") {
      console.error("[optin] Failed to record perks-only opt-in:", perksError);
      return NextResponse.redirect(`${origin}/`);
    }

    await supabase
      .from("members")
      .update({ consecutive_skips: 0 })
      .eq("id", memberId);

    // A no-op unless this month's round already committed -- see the
    // function's own doc comment for why commit-matches' own sweep can't
    // catch a perks opt-in landing after it's already run.
    await debitLatePerksIfRoundCommitted(supabase, memberId, monthDate);

    return signInAndRedirect(supabase, memberRow.email, `${origin}/my-perks?optin=perks`, origin);
  }

  const { data: existingPerks } = await supabase
    .from("monthly_perks")
    .select("id")
    .eq("member_id", memberId)
    .eq("month", monthDate)
    .maybeSingle();
  if (existingPerks) {
    return signInAndRedirect(supabase, memberRow.email, `${origin}/profile`, origin);
  }

  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("id")
    .eq("name", action)
    .maybeSingle();

  if (topicError || !topic) {
    console.error("[optin] Topic not found for action:", action, topicError);
    return NextResponse.redirect(`${origin}/`);
  }

  // Comped cohort members are always matched inside their cohort.
  let cohortOnly: boolean;
  try {
    cohortOnly = await resolveCohortOnly(supabase, memberId);
  } catch (e) {
    console.error("[optin] cohort lookup failed:", e);
    return NextResponse.redirect(`${origin}/`);
  }

  const { error: participationError } = await supabase
    .from("monthly_participation")
    .upsert(
      { member_id: memberId, month: monthDate, topic_id: topic.id, cohort_only: cohortOnly },
      { onConflict: "member_id,month" }
    );

  if (participationError) {
    console.error("[optin] Failed to record participation:", participationError);
    return NextResponse.redirect(`${origin}/`);
  }

  await supabase
    .from("members")
    .update({ consecutive_skips: 0 })
    .eq("id", memberId);

  return signInAndRedirect(supabase, memberRow.email, `${origin}/profile?optin=${action}`, origin);
}

// ---------------------------------------------------------------------------
// Helper: generate a Supabase magic link and redirect to it.
// Falls back to a plain redirect if generation fails.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function signInAndRedirect(supabase: any, email: string, redirectTo: string, origin: string) {
  // Route through /auth/confirm so the PKCE token_hash is handled correctly,
  // then on to the final destination via the `next` param.
  const next = redirectTo.startsWith(origin) ? redirectTo.slice(origin.length) : redirectTo;
  const confirmUrl = `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;

  const result = await generateMagicLinkWithRetry(supabase, email, confirmUrl);
  if (result.success) {
    return NextResponse.redirect(result.url);
  }
  console.error("[optin] Failed to generate magic link:", result.error);

  // Fallback — member lands on profile but may need to sign in manually
  return NextResponse.redirect(redirectTo);
}
