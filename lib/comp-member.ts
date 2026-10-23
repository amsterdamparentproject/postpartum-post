import type { createAdminClient } from "@/lib/supabase";
import { recordEntitlement } from "@/lib/match-ledger";
import { grantFreeMonth } from "@/lib/free-month-grants";
import { isComped } from "@/lib/billing-mode";

type AdminClient = ReturnType<typeof createAdminClient>;

export type CompMemberInput = {
  email: string;
  /** Optional full name as typed; split on the first space into first and last name. */
  name?: string;
  /** Whether the free round includes Post Perks (comped_with_perks) or is match only (comped_no_perks). */
  includePerks: boolean;
};

export type CompMemberResult =
  | { ok: true; existing: false; memberId: string; email: string; firstName: string; includePerks: boolean }
  /** The email already belonged to an active member, so they got +1 round and nothing else changed. */
  | { ok: true; existing: true; email: string; matchesRemaining: number }
  | { error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CompLookup =
  | { kind: "invalid" }
  | { kind: "new" }
  | { kind: "existing" }
  /** Already a member, but not active, so compMember refuses to add a round. */
  | { kind: "blocked"; status: string };

/** What compMember would do with this email, without changing anything. Used by the admin form's on-blur check. */
export async function lookupCompTarget(supabase: AdminClient, rawEmail: string): Promise<CompLookup | { error: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { kind: "invalid" };
  const { data, error } = await supabase.from("members").select("status").eq("email", email).maybeSingle();
  if (error) {
    console.error("[comp-member] lookup failed:", error);
    return { error: "Couldn't check whether that email is a member." };
  }
  if (!data) return { kind: "new" };
  return data.status === "active" ? { kind: "existing" } : { kind: "blocked", status: data.status as string };
}

/** "Holly Yao Shi" -> first "Holly", last "Yao Shi". members.first_name and last_name are NOT NULL, so blanks are "". */
export function splitName(name: string | undefined): { firstName: string; lastName: string } {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const space = trimmed.indexOf(" ");
  if (space === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1) };
}

/**
 * Gifts a brand-new person one free round of Postpartum Post, with or without
 * Post Perks, with no Stripe objects at all and no gift card.
 *
 * Creates an active member with billing_mode = comped_with_perks (or
 * comped_no_perks when includePerks is false) and credits
 * one round through the ledger (a manual_grant, the same call the cohort
 * signup uses). No subscription row means renew-check never bills them, and no
 * cohort means the matcher puts them in the normal pool (cohort_only is only
 * forced for members who have a cohort).
 *
 * If the email already belongs to an ACTIVE member, nobody is created: they
 * get +1 round instead (grantFreeMonth for a paying member, a direct ledger
 * credit for a comped one). Their plan, billing mode and Perks access stay as
 * they are, so includePerks is ignored. No email is sent for that case.
 *
 * Does not check who is calling: the admin server action does that.
 */
export async function compMember(supabase: AdminClient, input: CompMemberInput): Promise<CompMemberResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "That doesn't look like a valid email address." };

  const { firstName, lastName } = splitName(input.name);

  const { data: existing, error: lookupError } = await supabase
    .from("members")
    .select("id, status, billing_mode")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) {
    console.error("[comp-member] lookup failed:", lookupError);
    return { error: "Couldn't check for an existing member. Nothing was created." };
  }
  if (existing) {
    if (existing.status !== "active") {
      return { error: `That email is already a member, but their status is "${existing.status}", so I didn't add a round. Nothing was changed.` };
    }
    try {
      if (isComped(existing.billing_mode)) {
        await recordEntitlement(supabase, { memberId: existing.id, event: "manual_grant", delta: 1, note: "comped:admin" });
        const { data: updated } = await supabase.from("members").select("matches_remaining").eq("id", existing.id).single();
        return { ok: true, existing: true, email, matchesRemaining: updated?.matches_remaining ?? 1 };
      }
      const granted = await grantFreeMonth(email, "comped:admin");
      return { ok: true, existing: true, email, matchesRemaining: granted.matchesRemaining };
    } catch (e) {
      console.error("[comp-member] grant to existing member failed:", e);
      return { error: e instanceof Error ? `Couldn't add a round: ${e.message}` : "Couldn't add a round. Nothing was changed." };
    }
  }

  const { data: member, error: insertError } = await supabase
    .from("members")
    .insert({
      first_name: firstName,
      last_name: lastName,
      email,
      status: "active",
      billing_mode: input.includePerks ? "comped_with_perks" : "comped_no_perks",
    })
    .select("id")
    .single();
  if (insertError || !member) {
    if (insertError?.code === "23505") {
      return { error: "That email is already a member. Nothing was created." };
    }
    console.error("[comp-member] insert failed:", insertError);
    return { error: "Couldn't create the member. Nothing was created." };
  }

  try {
    await recordEntitlement(supabase, {
      memberId: member.id,
      event: "manual_grant",
      delta: 1,
      note: "comped:admin",
    });
  } catch (e) {
    console.error("[comp-member] grant failed, rolling back member:", e);
    await supabase.from("members").delete().eq("id", member.id);
    return { error: "Couldn't credit the free round, so the member was not created." };
  }

  return { ok: true, existing: false, memberId: member.id as string, email, firstName, includePerks: input.includePerks };
}
