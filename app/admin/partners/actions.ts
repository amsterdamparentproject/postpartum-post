"use server";

import { createAdminClient } from "@/lib/supabase";
import { createLeadNote, type LeadNote } from "@/lib/lead-notes";
import { findMatchingLead, mergeIntoLead } from "@/lib/lead-matching";

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
 * 024_partner_leads.sql's updated comment for the full reasoning).
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

  return { success: true, partnerId: partner.id as string };
}

// ---------------------------------------------------------------------------
// Add partner directly (no lead) — e.g. a Circle of Experts contributor, or
// a business Alex signed up herself outside the lead-capture flow. Email is
// optional here (unlike convertLeadToPartner): a partner with no email has
// no portal access yet, same as db/migrations/023_perks.sql documents.
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
// Perk review queue
// ---------------------------------------------------------------------------

export type PerkReviewStatus = "pending" | "coming_soon" | "published" | "rejected" | "archived";

export type ReviewPerk = {
  id: string;
  status: PerkReviewStatus;
  created_at: string;
  perk_title: string;
  perk_description: string;
  perk_discount: string;
  partner_id: string;
  partner_name: string;
};

/**
 * Reads the perks_partners view (db/migrations/023_perks.sql) so the queue
 * gets the partner's business_name in one query instead of a second lookup
 * per perk — same join the eventual public /perks page will use.
 */
export async function listPerksForReview(): Promise<ReviewPerk[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("perks_partners")
    .select("id, status, created_at, perk_title, perk_description, perk_discount, partner_id, partner_name")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[listPerksForReview] query error:", error.message);
    return [];
  }
  return (data ?? []) as ReviewPerk[];
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
