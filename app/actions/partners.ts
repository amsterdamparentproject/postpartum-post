"use server";

import { revalidatePerksPage } from "@/lib/revalidate-perks";
import { createAdminClient } from "@/lib/supabase";
import { requirePartner } from "@/lib/require-partner";
import { deletePartnerLocationFor, savePartnerLocationFor } from "@/lib/partner-location-save";
import { sendPartnerLeadEmail } from "@/lib/emails/partner-lead";
import { createLeadNote } from "@/lib/lead-notes";
import { findMatchingLead, mergeIntoLead } from "@/lib/lead-matching";
import { commitPartnerImage, createPartnerImageUploadFor, type ImageUploadTicket } from "@/lib/partner-image-save";
import { normalizePerkInput, type PerkInput, type SavedPerkFields } from "@/lib/perk-input";
import { resolvePerkLocation } from "@/lib/perk-save";

export type PartnerLocation = {
  id: string;
  label: string | null;
  address: string;
  area: string | null;
  neighborhood: string | null;
};

export type PartnerProfile = {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  url: string | null;
  description: string | null;
  image_url: string | null;
  email: string;
  locations: PartnerLocation[];
};

/**
 * Mirrors checkMemberExists (app/actions/profile.ts) exactly, keyed on
 * partners instead of members — same pre-check MagicLinkRequest's partner
 * counterpart (PartnerLoginRequest) uses before sending a link, so an
 * unrecognized email routes to the lead-capture form instead of a dead
 * "check your inbox" screen for someone who was never added as a partner.
 */
export async function checkPartnerExists(email: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("partners")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();
  return data !== null;
}

/**
 * Mirrors getMemberProfile exactly — identity from the verified session
 * token only, never a client-supplied id or email (security-audit-2026-07-24,
 * Finding 1 applies here the same as it does to members).
 */
export async function getPartnerProfile(accessToken: string): Promise<PartnerProfile | null> {
  const authed = await requirePartner(accessToken);
  if (!authed) return null;

  const supabase = createAdminClient();
  const { data: partner, error } = await supabase
    .from("partners")
    .select("id, first_name, last_name, business_name, url, description, image_url, email")
    .eq("id", authed.partnerId)
    .single();
  if (error && error.code !== "PGRST116") {
    console.error("[getPartnerProfile] query error:", error.code, error.message);
  }
  if (!partner) return null;

  const { data: locations, error: locError } = await supabase
    .from("partner_locations")
    .select("id, label, address, area, neighborhood")
    .eq("partner_id", authed.partnerId)
    .order("created_at", { ascending: true });
  if (locError) {
    console.error("[getPartnerProfile] locations query error:", locError.message);
  }

  return { ...partner, locations: locations ?? [] } as PartnerProfile;
}

// image_url is not here: the photo saves on its own through the upload
// actions below (createPartnerImageUpload / setPartnerImage), so the
// autosaving profile form can never overwrite a fresh upload.
export type PartnerProfileInput = {
  business_name: string;
  url: string;
  description: string;
};

export async function savePartnerProfile(
  accessToken: string,
  input: PartnerProfileInput,
): Promise<{ success: boolean; error?: string }> {
  const authed = await requirePartner(accessToken);
  if (!authed) return { success: false, error: "Not signed in" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("partners")
    .update({
      business_name: input.business_name.trim(),
      url: input.url.trim() || null,
      description: input.description.trim() || null,
    })
    .eq("id", authed.partnerId);

  if (error) {
    console.error("[savePartnerProfile] update error:", error.message);
    return { success: false, error: "Couldn't save — try again" };
  }
  return { success: true };
}

export type PartnerContactInput = {
  first_name: string;
  last_name: string;
  email: string;
};

/**
 * "Your info" — first/last name and the login email itself. Mirrors
 * applyMemberProfileUpdate's email-change handling (app/actions/profile.ts)
 * exactly: normalize + dedupe-check against the same table, update the row,
 * and stop there. Supabase Auth's own user record is deliberately left
 * alone — same documented limitation as members (no user_id stored to call
 * admin.updateUserById), so a changed email takes effect next sign-in, via
 * whatever address the partner types into PartnerLoginRequest then.
 *
 * Because of that, the caller should NOT feed this into a context refetch
 * on the current accessToken after an email change — requirePartner()
 * resolves identity from the (unchanged) JWT email, which would no longer
 * match this row and would look like "not a partner," signing them out of
 * their own session mid-edit.
 */
export async function savePartnerContact(
  accessToken: string,
  input: PartnerContactInput,
): Promise<{ success: boolean; error?: string }> {
  const authed = await requirePartner(accessToken);
  if (!authed) return { success: false, error: "Not signed in" };

  const firstName = input.first_name.trim();
  const lastName = input.last_name.trim();
  const email = input.email.trim().toLowerCase();
  if (!firstName || !lastName || !email) {
    return { success: false, error: "First name, last name, and email are required" };
  }

  const supabase = createAdminClient();

  const emailChanged = email !== authed.email.toLowerCase();
  if (emailChanged) {
    const { data: existing } = await supabase
      .from("partners")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return { success: false, error: "That email is already associated with another partner account" };
    }
  }

  const { error } = await supabase
    .from("partners")
    .update({ first_name: firstName, last_name: lastName, email })
    .eq("id", authed.partnerId);

  if (error) {
    console.error("[savePartnerContact] update error:", error.message);
    return { success: false, error: "Couldn't save — try again" };
  }
  return { success: true };
}

export type PartnerLocationInput = {
  id?: string; // present = update, absent = create
  label: string;
  address: string;
};

/** Partner portal: add or edit one of your own locations (geocoded on save). */
export async function upsertPartnerLocation(
  accessToken: string,
  input: PartnerLocationInput,
): Promise<{ success: boolean; error?: string; location?: PartnerLocation }> {
  const authed = await requirePartner(accessToken);
  if (!authed) return { success: false, error: "Not signed in" };
  const result = await savePartnerLocationFor(createAdminClient(), authed.partnerId, input);
  if (result.success) revalidatePerksPage(); // perk cards show the location
  return result;
}

export async function deletePartnerLocation(
  accessToken: string,
  locationId: string,
): Promise<{ success: boolean; error?: string }> {
  const authed = await requirePartner(accessToken);
  if (!authed) return { success: false, error: "Not signed in" };
  const result = await deletePartnerLocationFor(createAdminClient(), authed.partnerId, locationId);
  if (result.success) revalidatePerksPage();
  return result;
}

export type PartnerLeadInput = {
  firstName: string;
  lastName: string;
  businessName: string;
  url: string;
  email: string;
  note: string;
};

/**
 * Public, unauthenticated — the fallback shown by PartnerLoginRequest when
 * a typed email isn't a recognized partner. No account, no perk, just an
 * inbound-interest record: saved to partner_leads (status defaults to
 * 'new') and an email straight to Alex so she sees it right away, same as
 * she would a cold-outreach reply. See db/migrations/024_perks.sql.
 *
 * Every field is required — name, business, and a note on the perk idea —
 * so a lead reflects some actual effort rather than a bare "email us"
 * click. Enforced here too, not just in PartnerLeadForm's `required`
 * inputs, since a client-side attribute alone is never a real guarantee.
 */
export async function submitPartnerLead(
  input: PartnerLeadInput,
): Promise<{ success: boolean; error?: string }> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const businessName = input.businessName.trim();
  const url = input.url.trim();
  const email = input.email.trim().toLowerCase();
  const note = input.note.trim();
  if (!firstName || !lastName || !businessName || !url || !email || !note) {
    return { success: false, error: "All fields are required" };
  }

  const supabase = createAdminClient();

  // Same business already has a lead (by name or URL) — fold this
  // submission into it instead of creating a disconnected duplicate.
  const match = await findMatchingLead(supabase, businessName, url);
  if (match) {
    const result = await mergeIntoLead(supabase, match, { note, firstName, lastName, email });
    if (!result.success) return result;
  } else {
    const { error } = await supabase.from("partner_leads").insert({
      first_name: firstName,
      last_name: lastName,
      business_name: businessName,
      url,
      email,
      notes: [createLeadNote(note)],
    });

    if (error) {
      console.error("[submitPartnerLead] insert error:", error.message);
      return { success: false, error: "Couldn't submit — try again" };
    }
  }

  // Fire-and-forget — the lead is already saved above regardless of whether
  // this notification email succeeds.
  try {
    await sendPartnerLeadEmail({ firstName, lastName, businessName, url, email, note });
  } catch (emailError) {
    console.error("[submitPartnerLead] notification email failed:", emailError);
  }

  return { success: true };
}

/**
 * Best-effort business name from a submitted URL, used only as a starting
 * point for the /perks idea box below — Alex fixes it via the "Edit"
 * pencil on the resulting lead if it's off. Handles the common case of a
 * Google Maps share link (.../maps/place/<Name>/...) specially, since the
 * hostname alone ("www.google.com") is useless there; otherwise falls
 * back to the hostname, plus the path when there is one.
 *
 * The path matters: a bare hostname fallback used to be the guessed name
 * for EVERY link sharing that hostname — most visibly every shortened
 * Google Maps link (maps.app.goo.gl/<token>), which all guessed the same
 * "maps.app.goo.gl" name, so findMatchingLead's business-name check
 * silently merged unrelated suggestions into one lead. Including the path
 * makes each shortened link's guess unique again, without needing to
 * follow the redirect.
 */
function guessBusinessNameFromUrl(url: string): string {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (parsed.hostname.includes("google.") && parsed.pathname.includes("/maps/place/")) {
      const segment = parsed.pathname.split("/maps/place/")[1]?.split("/")[0];
      const decoded = segment ? decodeURIComponent(segment.replace(/\+/g, " ")).trim() : "";
      if (decoded) return decoded;
    }
    const hostname = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${hostname}${path}`;
  } catch {
    return "New perk idea";
  }
}

export type PerkIdeaInput = {
  url: string;
  // The "win 1 of 3 free trials when Post Perks launches" checkbox —
  // wantsGiveaway gates whether email/name are required and whether a
  // perk_giveaway_entries row gets created. See db/migrations/025_perk_giveaway_entries.sql.
  wantsGiveaway?: boolean;
  name?: string;
  email?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The "know a place?" box on the still-in-development /perks page. Always
 * public, no account needed — but no longer fully anonymous: checking
 * "win 1 of 3 free trials when Post Perks launches" collects name (optional)
 * + email (required) and creates a giveaway entry alongside the
 * suggestion. Deliberately files the suggestion itself as an 'idea' lead
 * (Alex's own reasoning bucket) rather than 'new' (a business applying for
 * itself), since this is a member suggesting someone else's business, not
 * that business reaching out.
 *
 * If the link already matches an existing lead (see lib/lead-matching.ts),
 * this only adds a note to it rather than reusing mergeIntoLead's
 * idea->new promotion — a member's suggestion isn't the business itself
 * confirming interest, so the status shouldn't move.
 *
 * The giveaway entry is intentionally its own table
 * (perk_giveaway_entries), not folded into partner_leads: mergeIntoLead
 * only backfills a lead's email/name when that field is currently empty,
 * so a second person suggesting the same already-known business would have
 * their entry silently dropped if it lived on the lead row instead. See
 * that migration's comment and __claude__/free-trial-plan.md.
 */
export async function submitPerkIdea(
  input: PerkIdeaInput,
): Promise<{ success: boolean; error?: string; giveawayError?: string }> {
  const url = input.url.trim();
  if (!url) {
    return { success: false, error: "Add a link first" };
  }

  const wantsGiveaway = input.wantsGiveaway === true;
  const name = input.name?.trim() || null;
  const email = input.email?.trim().toLowerCase() || "";
  if (wantsGiveaway && !EMAIL_RE.test(email)) {
    return { success: false, error: "Add a valid email to enter the drawing" };
  }

  const supabase = createAdminClient();
  const businessName = guessBusinessNameFromUrl(url);

  let leadId: string | null = null;

  const match = await findMatchingLead(supabase, businessName, url);
  if (match) {
    leadId = match.id;
    const notes = [...(match.notes ?? []), createLeadNote(`Suggested again via the /perks page: ${url}`)];
    const { error } = await supabase.from("partner_leads").update({ notes }).eq("id", match.id);
    if (error) {
      console.error("[submitPerkIdea] merge update error:", error.message);
      return { success: false, error: "Couldn't submit — try again" };
    }
  } else {
    const { data, error } = await supabase
      .from("partner_leads")
      .insert({
        business_name: businessName,
        url,
        notes: [createLeadNote("Suggested by a member via the /perks page.")],
        status: "idea",
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[submitPerkIdea] insert error:", error?.message);
      return { success: false, error: "Couldn't submit — try again" };
    }
    leadId = data.id as string;
  }

  if (!wantsGiveaway) {
    return { success: true };
  }

  const { error: entryError } = await supabase.from("perk_giveaway_entries").insert({
    name,
    email,
    url,
    partner_lead_id: leadId,
  });
  if (entryError) {
    console.error("[submitPerkIdea] giveaway entry insert error:", entryError.message);
    // The suggestion itself was saved above — don't tell the member the
    // whole submission failed, but do surface that their entry specifically
    // didn't go through, since a real prize-eligibility commitment to a
    // real person should never fail silently.
    return {
      success: true,
      giveawayError: "Your suggestion was sent, but we couldn't save your giveaway entry — try again or email us.",
    };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Partner photo (partners.image_url) — see lib/partner-image-save.ts
// ---------------------------------------------------------------------------

export async function createPartnerImageUpload(
  accessToken: string,
  contentType: string,
): Promise<ImageUploadTicket> {
  const authed = await requirePartner(accessToken);
  if (!authed) return { success: false, error: "Not signed in" };
  return createPartnerImageUploadFor(createAdminClient(), authed.partnerId, contentType);
}

/** path = the uploaded file's bucket path, or null to remove the photo. */
export async function setPartnerImage(
  accessToken: string,
  path: string | null,
): Promise<{ success: boolean; error?: string; imageUrl?: string | null }> {
  const authed = await requirePartner(accessToken);
  if (!authed) return { success: false, error: "Not signed in" };
  const result = await commitPartnerImage(createAdminClient(), authed.partnerId, path);
  if (result.success) revalidatePerksPage();
  return result;
}

// ---------------------------------------------------------------------------
// Your Perks tab
// ---------------------------------------------------------------------------

export type PartnerPerk = SavedPerkFields & {
  status: "pending" | "coming_soon" | "published" | "rejected" | "archived";
};

const PERK_FIELDS =
  "id, status, location_id, title, description, redemption_type, redemption_code, url, expires_at, exclusive";

export async function listPartnerPerks(accessToken: string): Promise<PartnerPerk[]> {
  const authed = await requirePartner(accessToken);
  if (!authed) return [];

  const supabase = createAdminClient();
  const { data: perks, error } = await supabase
    .from("perks")
    .select(PERK_FIELDS)
    .eq("partner_id", authed.partnerId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[listPartnerPerks] query error:", error.message);
    return [];
  }
  return (perks ?? []) as PartnerPerk[];
}

export type PartnerPerkInput = PerkInput & {
  id?: string; // present = update, absent = create
};

/**
 * Always forces source: 'partner_portal' and status: 'pending' server-side
 * — never trust a client-supplied status (same rule as everywhere else in
 * this file). A partner editing an already-published perk sends it back to
 * pending for Alex to re-review, rather than silently changing what's live;
 * that's intentional editorial control, not a bug — see the Sep 2026
 * self-service-portal design notes.
 */
export async function savePartnerPerk(
  accessToken: string,
  input: PartnerPerkInput,
): Promise<{ success: boolean; error?: string; perkId?: string }> {
  const authed = await requirePartner(accessToken);
  if (!authed) return { success: false, error: "Not signed in" };

  const normalized = normalizePerkInput(input);
  if (!normalized.ok) return { success: false, error: normalized.error };

  const supabase = createAdminClient();

  if (input.id) {
    const { data: existing } = await supabase
      .from("perks")
      .select("id")
      .eq("id", input.id)
      .eq("partner_id", authed.partnerId)
      .maybeSingle();
    if (!existing) return { success: false, error: "Perk not found" };
  }

  const location = await resolvePerkLocation(supabase, authed.partnerId, input.location_id);
  if (!location.ok) return { success: false, error: location.error };

  const row = {
    ...normalized.row,
    partner_id: authed.partnerId,
    source: "partner_portal" as const,
    status: "pending" as const,
    location_id: location.locationId,
  };

  const { data: perk, error } = input.id
    ? await supabase.from("perks").update(row).eq("id", input.id).select("id").single()
    : await supabase.from("perks").insert(row).select("id").single();

  if (error || !perk) {
    console.error("[savePartnerPerk] write error:", error?.message);
    return { success: false, error: "Couldn't save — try again" };
  }

  // An edit sends a live perk back to review, so it leaves /perks.
  revalidatePerksPage();
  return { success: true, perkId: perk.id as string };
}
