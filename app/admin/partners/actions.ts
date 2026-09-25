"use server";

import { createAdminClient } from "@/lib/supabase";
import { createLeadNote, type LeadNote } from "@/lib/lead-notes";
import { findMatchingLead, mergeIntoLead } from "@/lib/lead-matching";
import { sendPartnerWelcomeEmail } from "@/lib/emails/partner-welcome";
import { generateMagicLinkWithRetry } from "@/lib/supabase/generate-magic-link";
import { SITE_URL } from "@/lib/emails/base";

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export type LeadStatus = "idea" | "new" | "contacted" | "converted" | "rejected";

export type PartnerLead = {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string;
  url: string;
  email: string | null;
  notes: LeadNote[];
  status: LeadStatus;
  converted_partner_id: string | null;
};

/**
 * Ordered alphabetically by business name, not by created_at — deliberate,
 * so a near-duplicate ("Joe's Coffee" vs "Joes Coffee Shop") lands next to
 * its sibling for Alex to spot by eye. findMatchingLead only catches an
 * exact match; this sort is the low-tech backstop for everything short of
 * that. Sorted client-side (not via the query's .order()) so it's
 * consistently case-insensitive regardless of DB collation.
 */
export async function listPartnerLeads(): Promise<PartnerLead[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("partner_leads")
    .select("id, created_at, first_name, last_name, business_name, url, email, notes, status, converted_partner_id");
  if (error) {
    console.error("[listPartnerLeads] query error:", error.message);
    return [];
  }
  return ((data ?? []) as PartnerLead[]).sort((a, b) =>
    a.business_name.localeCompare(b.business_name, undefined, { sensitivity: "base" }),
  );
}

/**
 * A potential partner Alex identifies herself — a business she wants to
 * approach, as opposed to 'new', which is always an inbound public
 * submission from PartnerLeadForm. Contact name/email are optional here:
 * she may not have anyone to reach out to yet, just a business + site +
 * why. business_name/url/note stay required (see db/migrations/
 * 024_perks.sql's updated comment for the full reasoning).
 */
export type AddLeadIdeaInput = {
  businessName: string;
  url: string;
  note: string;
  firstName: string;
  lastName: string;
  email: string;
};

export async function addPartnerLeadIdea(
  input: AddLeadIdeaInput,
): Promise<{ success: boolean; error?: string }> {
  const businessName = input.businessName.trim();
  const url = input.url.trim();
  const note = input.note.trim();
  if (!businessName || !url || !note) {
    return { success: false, error: "Business name, website, and a note are required" };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();

  const supabase = createAdminClient();

  // Same business already has a lead (by name or URL) — fold this idea's
  // note into it instead of creating a disconnected duplicate.
  const match = await findMatchingLead(supabase, businessName, url);
  if (match) {
    return mergeIntoLead(supabase, match, {
      note,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: email || undefined,
    });
  }

  const { error } = await supabase.from("partner_leads").insert({
    business_name: businessName,
    url,
    notes: [createLeadNote(note)],
    first_name: firstName || null,
    last_name: lastName || null,
    email: email || null,
    status: "idea",
  });

  if (error) {
    console.error("[addPartnerLeadIdea] insert error:", error.message);
    return { success: false, error: "Couldn't save — try again" };
  }
  return { success: true };
}

/**
 * Edits a lead's core identifying fields — the "Edit" button on a lead
 * card. Contact fields stay optional/nullable here, same as
 * addPartnerLeadIdea, since an 'idea' lead may still have none. Business
 * name and URL stay required — they're what findMatchingLead keys off of,
 * so this deliberately does NOT re-run the match check: editing a lead
 * should never silently fold it into a different one.
 */
export type UpdateLeadDetailsInput = {
  leadId: string;
  businessName: string;
  url: string;
  firstName: string;
  lastName: string;
  email: string;
};

export async function updateLeadDetails(
  input: UpdateLeadDetailsInput,
): Promise<{ success: boolean; error?: string }> {
  const businessName = input.businessName.trim();
  const url = input.url.trim();
  if (!businessName || !url) {
    return { success: false, error: "Business name and website are required" };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("partner_leads")
    .update({
      business_name: businessName,
      url,
      first_name: firstName || null,
      last_name: lastName || null,
      email: email || null,
    })
    .eq("id", input.leadId);

  if (error) {
    console.error("[updateLeadDetails] update error:", error.message);
    return { success: false, error: "Couldn't save — try again" };
  }
  return { success: true };
}

/**
 * Appends a new dated entry to a lead's notes log — the "+ Note" button on
 * an existing lead card. Read-modify-write rather than a jsonb append
 * expression: the notes array is small (a handful of entries per lead at
 * most) and this keeps the shape/validation in application code rather
 * than in SQL.
 */
export async function addLeadNote(
  leadId: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const note = text.trim();
  if (!note) {
    return { success: false, error: "Note can't be empty" };
  }

  const supabase = createAdminClient();
  const { data: lead, error: fetchError } = await supabase
    .from("partner_leads")
    .select("notes")
    .eq("id", leadId)
    .single();
  if (fetchError || !lead) {
    console.error("[addLeadNote] fetch error:", fetchError?.message);
    return { success: false, error: "Couldn't save — try again" };
  }

  const notes = [...((lead.notes as LeadNote[] | null) ?? []), createLeadNote(note)];
  const { error } = await supabase.from("partner_leads").update({ notes }).eq("id", leadId);
  if (error) {
    console.error("[addLeadNote] update error:", error.message);
    return { success: false, error: "Couldn't save — try again" };
  }
  return { success: true };
}

/**
 * Corrects the text of an existing note entry — the "Edit" button on a
 * note. The entry's date/id are left untouched; only its text changes,
 * since date represents when the note was originally added.
 */
export async function editLeadNote(
  leadId: string,
  noteId: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const newText = text.trim();
  if (!newText) {
    return { success: false, error: "Note can't be empty" };
  }

  const supabase = createAdminClient();
  const { data: lead, error: fetchError } = await supabase
    .from("partner_leads")
    .select("notes")
    .eq("id", leadId)
    .single();
  if (fetchError || !lead) {
    console.error("[editLeadNote] fetch error:", fetchError?.message);
    return { success: false, error: "Couldn't save — try again" };
  }

  const existing = (lead.notes as LeadNote[] | null) ?? [];
  if (!existing.some((n) => n.id === noteId)) {
    return { success: false, error: "Note not found" };
  }
  const notes = existing.map((n) => (n.id === noteId ? { ...n, note: newText } : n));

  const { error } = await supabase.from("partner_leads").update({ notes }).eq("id", leadId);
  if (error) {
    console.error("[editLeadNote] update error:", error.message);
    return { success: false, error: "Couldn't save — try again" };
  }
  return { success: true };
}

/**
 * Removes a single note entry from a lead's log — the trash icon on a
 * note. Read-modify-write, same shape as addLeadNote/editLeadNote.
 */
export async function deleteLeadNote(
  leadId: string,
  noteId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { data: lead, error: fetchError } = await supabase
    .from("partner_leads")
    .select("notes")
    .eq("id", leadId)
    .single();
  if (fetchError || !lead) {
    console.error("[deleteLeadNote] fetch error:", fetchError?.message);
    return { success: false, error: "Couldn't delete — try again" };
  }

  const notes = ((lead.notes as LeadNote[] | null) ?? []).filter((n) => n.id !== noteId);
  const { error } = await supabase.from("partner_leads").update({ notes }).eq("id", leadId);
  if (error) {
    console.error("[deleteLeadNote] update error:", error.message);
    return { success: false, error: "Couldn't delete — try again" };
  }
  return { success: true };
}

/**
 * Permanently removes a lead — the trash icon on a lead card. Unlike
 * setLeadStatus("rejected"), this actually deletes the row (and its whole
 * notes log) rather than just marking it closed; use it for a genuine
 * mistake (a duplicate that findMatchingLead missed because the names
 * didn't match, a test entry) rather than "not a fit," which should stay
 * on record. No FK cleanup needed: a converted lead's
 * converted_partner_id is a reference FROM partner_leads, so the partners
 * row itself is untouched either way.
 */
export async function deleteLead(leadId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("partner_leads").delete().eq("id", leadId);
  if (error) {
    console.error("[deleteLead] delete error:", error.message);
    return { success: false, error: "Couldn't delete — try again" };
  }
  return { success: true };
}

/**
 * Quick status change with no side effects — "Mark contacted" / "Not a fit"
 * from the leads list. Converting to a partner goes through
 * convertLeadToPartner instead, which also creates the partners row.
 */
export async function setLeadStatus(
  leadId: string,
  status: Exclude<LeadStatus, "converted">,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("partner_leads").update({ status }).eq("id", leadId);
  if (error) {
    console.error("[setLeadStatus] update error:", error.message);
    return { success: false, error: "Couldn't update — try again" };
  }
  return { success: true };
}

export type ConvertLeadInput = {
  leadId: string;
  firstName: string;
  lastName: string;
  businessName: string;
  url: string;
  email: string;
};

/**
 * Turns a lead into a real partners row so they can sign in at
 * /partners/login. Pre-filled from the lead's own submission but editable
 * first, since a lead's typed business name/email is exactly what should
 * become the login identity — no reason to force Alex to retype it, but no
 * reason to trust it blindly either (e.g. a typo'd email she wants to fix
 * before it becomes someone's login). All fields are required here even
 * for an 'idea' lead that started with no contact info — a real partner
 * row needs one before it can be a working login.
 */
export async function convertLeadToPartner(
  input: ConvertLeadInput,
): Promise<{ success: boolean; error?: string; partnerId?: string }> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const businessName = input.businessName.trim();
  const url = input.url.trim();
  const email = input.email.trim().toLowerCase();
  if (!firstName || !lastName || !businessName || !url || !email) {
    return { success: false, error: "All fields are required" };
  }

  const supabase = createAdminClient();

  const { data: existingPartner } = await supabase
    .from("partners")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingPartner) {
    return { success: false, error: "A partner with that email already exists" };
  }

  const { data: partner, error } = await supabase
    .from("partners")
    .insert({ first_name: firstName, last_name: lastName, business_name: businessName, url, email })
    .select("id")
    .single();

  if (error || !partner) {
    console.error("[convertLeadToPartner] insert error:", error?.message);
    return { success: false, error: "Couldn't create partner — try again" };
  }

  const { error: leadError } = await supabase
    .from("partner_leads")
    .update({ status: "converted", converted_partner_id: partner.id })
    .eq("id", input.leadId);
  if (leadError) {
    // Partner row exists either way — worth surfacing, not worth rolling back.
    console.error("[convertLeadToPartner] lead update error:", leadError.message);
  }

  // Signed magic link so "Go to your portal" in the welcome email
  // signs the partner straight into /partners/profile — same pattern
  // app/api/send-match-emails/route.ts uses for member emails. Falls back
  // to a plain /partners/login URL (a normal, if slightly slower, sign-in)
  // if link generation fails, rather than blocking the welcome email on it.
  const loginUrl = `${SITE_URL}/partners/login`;
  const linkResult = await generateMagicLinkWithRetry(supabase, email, `${SITE_URL}/partners/profile`);
  if (!linkResult.success) {
    console.error("[convertLeadToPartner] generateLink failed:", linkResult.error);
  }
  const portalUrl = linkResult.success ? linkResult.url : loginUrl;

  // Fire-and-forget — the partner row is already saved above regardless of
  // whether this welcome email succeeds (same call submitPartnerLead makes
  // for its own notification email).
  try {
    await sendPartnerWelcomeEmail({ firstName, businessName, email, portalUrl });
  } catch (emailError) {
    console.error("[convertLeadToPartner] welcome email failed:", emailError);
  }

  return { success: true, partnerId: partner.id as string };
}

// ---------------------------------------------------------------------------
// Add partner directly (no lead) — e.g. a Circle of Experts contributor, or
// a business Alex signed up herself outside the lead-capture flow. Email is
// optional here (unlike convertLeadToPartner): a partner with no email has
// no portal access yet, same as db/migrations/024_perks.sql documents.
// ---------------------------------------------------------------------------

export type AddPartnerInput = {
  firstName: string;
  lastName: string;
  businessName: string;
  email: string; // "" = no portal access yet
};

export async function addPartner(
  input: AddPartnerInput,
): Promise<{ success: boolean; error?: string; partnerId?: string }> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const businessName = input.businessName.trim();
  const email = input.email.trim().toLowerCase();
  if (!firstName || !lastName || !businessName) {
    return { success: false, error: "First name, last name, and business name are required" };
  }

  const supabase = createAdminClient();

  if (email) {
    const { data: existingPartner } = await supabase
      .from("partners")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingPartner) {
      return { success: false, error: "A partner with that email already exists" };
    }
  }

  const { data: partner, error } = await supabase
    .from("partners")
    .insert({ first_name: firstName, last_name: lastName, business_name: businessName, email: email || null })
    .select("id")
    .single();

  if (error || !partner) {
    console.error("[addPartner] insert error:", error?.message);
    return { success: false, error: "Couldn't create partner — try again" };
  }

  return { success: true, partnerId: partner.id as string };
}

// ---------------------------------------------------------------------------
// Partners list — for associating an admin-added perk with an existing
// partner. Every row in `partners` is already a converted partner by
// definition (conversion is what creates the row, via convertLeadToPartner
// or addPartner above), so this is simply "all partners."
// ---------------------------------------------------------------------------

export type PartnerOption = {
  id: string;
  first_name: string;
  last_name: string;
  business_name: string;
  url: string | null;
  email: string | null; // null = no portal access yet
};

export async function listPartners(): Promise<PartnerOption[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("partners")
    .select("id, first_name, last_name, business_name, url, email")
    .order("business_name", { ascending: true });
  if (error) {
    console.error("[listPartners] query error:", error.message);
    return [];
  }
  return (data ?? []) as PartnerOption[];
}

export type PartnerLocationOption = {
  id: string;
  label: string | null;
  address: string;
};

export async function listPartnerLocations(partnerId: string): Promise<PartnerLocationOption[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("partner_locations")
    .select("id, label, address")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[listPartnerLocations] query error:", error.message);
    return [];
  }
  return (data ?? []) as PartnerLocationOption[];
}

/**
 * Edits a partner's core identifying fields — the "Edit" button on a
 * partner card. Same field set and validation shape as updateLeadDetails,
 * just keyed on partners instead of partner_leads: business name/first/
 * last name required, url/email optional. An email change is re-checked
 * for uniqueness (partners.email has a unique constraint) same as
 * convertLeadToPartner/addPartner's own checks — this is also the login
 * identity, so a collision would silently break someone else's portal
 * access.
 */
export type UpdatePartnerInput = {
  partnerId: string;
  businessName: string;
  url: string;
  firstName: string;
  lastName: string;
  email: string;
};

export async function updatePartner(
  input: UpdatePartnerInput,
): Promise<{ success: boolean; error?: string }> {
  const businessName = input.businessName.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const url = input.url.trim();
  const email = input.email.trim().toLowerCase();
  if (!businessName || !firstName || !lastName) {
    return { success: false, error: "Business name, first name, and last name are required" };
  }

  const supabase = createAdminClient();

  if (email) {
    const { data: existing } = await supabase
      .from("partners")
      .select("id")
      .eq("email", email)
      .neq("id", input.partnerId)
      .maybeSingle();
    if (existing) {
      return { success: false, error: "A partner with that email already exists" };
    }
  }

  const { error } = await supabase
    .from("partners")
    .update({
      business_name: businessName,
      url: url || null,
      first_name: firstName,
      last_name: lastName,
      email: email || null,
    })
    .eq("id", input.partnerId);

  if (error) {
    console.error("[updatePartner] update error:", error.message);
    return { success: false, error: "Couldn't save — try again" };
  }
  return { success: true };
}

/**
 * Permanently removes a partner — the trash icon on a partner card, same
 * "genuine mistake, not a status change" semantics as deleteLead. Hard
 * delete: partner_locations and perks both cascade on partner_id (see
 * db/migrations/024_perks.sql), so this also removes their locations and
 * every perk tied to them, live or not — worth the confirm step already
 * built into the UI.
 */
export async function deletePartner(partnerId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("partners").delete().eq("id", partnerId);
  if (error) {
    console.error("[deletePartner] delete error:", error.message);
    return { success: false, error: "Couldn't delete — try again" };
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Perk review queue
// ---------------------------------------------------------------------------

export type PerkReviewStatus = "pending" | "coming_soon" | "published" | "rejected" | "archived";

export type ReviewPerk = {
  id: string;
  status: PerkReviewStatus;
  created_at: string;
  location_id: string | null;
  partner_link: string | null;
  perk_title: string;
  perk_description: string;
  perk_discount: string;
  redemption_instructions: string | null;
  perk_redemption_code: string | null;
  perk_redemption_url: string | null;
  expires_at: string | null;
  exclusive: boolean;
  partner_id: string;
  partner_name: string;
  category_ids: string[];
};

/**
 * Reads the perks_partners view (db/migrations/024_perks.sql) so the queue
 * gets the partner's business_name in one query instead of a second lookup
 * per perk — same join the eventual public /perks page will use. Selects
 * every editable field, not just the review-card display fields, so
 * PerkCard's "Edit" form (updatePerkAdmin below) doesn't need a second
 * per-perk fetch — same tradeoff listPartnerPerks already makes for the
 * partner-portal "Your Perks" tab.
 */
export async function listPerksForReview(): Promise<ReviewPerk[]> {
  const supabase = createAdminClient();
  const { data: perks, error } = await supabase
    .from("perks_partners")
    .select(
      "id, status, created_at, location_id, partner_link, perk_title, perk_description, perk_discount, redemption_instructions, perk_redemption_code, perk_redemption_url, expires_at, exclusive, partner_id, partner_name",
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[listPerksForReview] query error:", error.message);
    return [];
  }
  if (!perks || perks.length === 0) return [];

  const { data: links } = await supabase
    .from("perks_category_links")
    .select("perk_id, category_id")
    .in("perk_id", perks.map((p) => p.id));

  return perks.map((p) => ({
    ...p,
    category_ids: (links ?? []).filter((l) => l.perk_id === p.id).map((l) => l.category_id),
  })) as ReviewPerk[];
}

export async function setPerkStatus(
  perkId: string,
  status: PerkReviewStatus,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("perks").update({ status }).eq("id", perkId);
  if (error) {
    console.error("[setPerkStatus] update error:", error.message);
    return { success: false, error: "Couldn't update — try again" };
  }
  return { success: true };
}

export type UpdatePerkInput = {
  perkId: string;
  status: PerkReviewStatus;
  location_id: string | null;
  partner_link: string;
  perk_title: string;
  perk_description: string;
  perk_discount: string;
  redemption_instructions: string;
  perk_redemption_code: string;
  perk_redemption_url: string;
  expires_at: string; // "" = no expiry
  exclusive: boolean;
  category_ids: string[];
};

/**
 * Full-content edit from the admin Perks queue — the "Edit" button on a
 * PerkCard, for perks submitted through the partner portal as much as
 * ones Alex added herself. Unlike savePartnerPerk (the partner-portal
 * counterpart), this never forces source or status: Alex is the reviewer,
 * so her own edit doesn't need to re-queue itself for review, and status
 * is whatever she sets here (independent of PerkCard's own quick-action
 * buttons, which still work the same way). partner_id is deliberately not
 * editable here — reassigning a perk to a different partner isn't a real
 * edit case, it's closer to delete-and-recreate (addPerkForPartner below).
 */
export async function updatePerkAdmin(
  input: UpdatePerkInput,
): Promise<{ success: boolean; error?: string }> {
  const title = input.perk_title.trim();
  const description = input.perk_description.trim();
  const discount = input.perk_discount.trim();
  if (!title || !description || !discount) {
    return { success: false, error: "Title, description, and discount are required" };
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("perks")
    .select("id, partner_id")
    .eq("id", input.perkId)
    .maybeSingle();
  if (!existing) return { success: false, error: "Perk not found" };

  if (input.location_id) {
    const { data: loc } = await supabase
      .from("partner_locations")
      .select("id")
      .eq("id", input.location_id)
      .eq("partner_id", existing.partner_id)
      .maybeSingle();
    if (!loc) return { success: false, error: "Location not found" };
  }

  const { error } = await supabase
    .from("perks")
    .update({
      status: input.status,
      location_id: input.location_id,
      partner_link: input.partner_link.trim() || null,
      perk_title: title,
      perk_description: description,
      perk_discount: discount,
      redemption_instructions: input.redemption_instructions.trim() || null,
      perk_redemption_code: input.perk_redemption_code.trim() || null,
      perk_redemption_url: input.perk_redemption_url.trim() || null,
      expires_at: input.expires_at || null,
      exclusive: input.exclusive,
    })
    .eq("id", input.perkId);

  if (error) {
    console.error("[updatePerkAdmin] update error:", error.message);
    return { success: false, error: "Couldn't save — try again" };
  }

  // Category links: delete + re-insert, same as savePartnerPerk.
  await supabase.from("perks_category_links").delete().eq("perk_id", input.perkId);
  if (input.category_ids.length > 0) {
    await supabase.from("perks_category_links").insert(
      input.category_ids.map((category_id) => ({ perk_id: input.perkId, category_id })),
    );
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Add perk directly (no partner-portal submission) — Alex adding a perk on
// behalf of a partner she's already worked out the details with, so it's
// there waiting the first time they open their own portal.
// ---------------------------------------------------------------------------

export type AdminPerkInput = {
  partner_id: string;
  location_id: string | null;
  partner_link: string;
  perk_title: string;
  perk_description: string;
  perk_discount: string;
  redemption_instructions: string;
  perk_redemption_code: string;
  perk_redemption_url: string;
  expires_at: string; // "" = no expiry
  exclusive: boolean;
  category_ids: string[];
  status: PerkReviewStatus;
};

/**
 * The admin counterpart to savePartnerPerk (app/actions/partners.ts):
 * always forces source: 'manual' rather than 'partner_portal', and —
 * unlike that action — trusts the admin-chosen status directly instead of
 * forcing 'pending', since Alex is the one who'd be reviewing it anyway.
 * listPartnerPerks has no source filter, so the perk shows up in that
 * partner's own "Your Perks" tab right away; if they edit it there,
 * savePartnerPerk's own rule sends it back to 'pending' for re-review,
 * same as any partner-authored edit.
 */
export async function addPerkForPartner(
  input: AdminPerkInput,
): Promise<{ success: boolean; error?: string; perkId?: string }> {
  const title = input.perk_title.trim();
  const description = input.perk_description.trim();
  const discount = input.perk_discount.trim();
  if (!input.partner_id || !title || !description || !discount) {
    return { success: false, error: "Partner, title, description, and discount are required" };
  }

  const supabase = createAdminClient();

  const { data: partner } = await supabase
    .from("partners")
    .select("id")
    .eq("id", input.partner_id)
    .maybeSingle();
  if (!partner) return { success: false, error: "Partner not found" };

  // location_id, if set, must actually belong to this partner.
  if (input.location_id) {
    const { data: loc } = await supabase
      .from("partner_locations")
      .select("id")
      .eq("id", input.location_id)
      .eq("partner_id", input.partner_id)
      .maybeSingle();
    if (!loc) return { success: false, error: "Location not found" };
  }

  const row = {
    partner_id: input.partner_id,
    source: "manual" as const,
    status: input.status,
    location_id: input.location_id,
    partner_link: input.partner_link.trim() || null,
    perk_title: title,
    perk_description: description,
    perk_discount: discount,
    redemption_instructions: input.redemption_instructions.trim() || null,
    perk_redemption_code: input.perk_redemption_code.trim() || null,
    perk_redemption_url: input.perk_redemption_url.trim() || null,
    expires_at: input.expires_at || null,
    exclusive: input.exclusive,
  };

  const { data: perk, error } = await supabase.from("perks").insert(row).select("id").single();
  if (error || !perk) {
    console.error("[addPerkForPartner] insert error:", error?.message);
    return { success: false, error: "Couldn't save — try again" };
  }

  if (input.category_ids.length > 0) {
    await supabase.from("perks_category_links").insert(
      input.category_ids.map((category_id) => ({ perk_id: perk.id, category_id })),
    );
  }

  return { success: true, perkId: perk.id as string };
}

