"use server";

import { createAdminClient } from "@/lib/supabase";
import { requirePartner } from "@/lib/require-partner";
import { geocodeAddress } from "@/lib/geocode";
import { sendPartnerLeadEmail } from "@/lib/emails/partner-lead";

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

export type PartnerProfileInput = {
  business_name: string;
  url: string;
  description: string;
  image_url: string;
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
      image_url: input.image_url.trim() || null,
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

/**
 * Geocodes server-side on every save (address or label change) via the
 * shared lib/geocode.ts helper — same Nominatim call the activities.events
 * pipeline uses, extended with addressdetails=1 for the non-AI area/
 * neighborhood suggestion (see that file's docblock). area/neighborhood
 * are stored as plain best-effort suggestions, not re-shown for manual
 * editing in this first pass — a wrong guess just means those two fields
 * stay null, which is a fine fallback (they're the app's own AREAS
 * vocabulary, not user-facing copy).
 */
export async function upsertPartnerLocation(
  accessToken: string,
  input: PartnerLocationInput,
): Promise<{ success: boolean; error?: string; location?: PartnerLocation }> {
  const authed = await requirePartner(accessToken);
  if (!authed) return { success: false, error: "Not signed in" };

  const address = input.address.trim();
  if (!address) return { success: false, error: "Address is required" };

  const supabase = createAdminClient();

  // Ownership check on update — never trust a client-supplied location id
  // without confirming it belongs to this partner (same rule as requirePartner
  // itself: identity from the verified session, everything else re-checked).
  if (input.id) {
    const { data: existing } = await supabase
      .from("partner_locations")
      .select("id")
      .eq("id", input.id)
      .eq("partner_id", authed.partnerId)
      .maybeSingle();
    if (!existing) return { success: false, error: "Location not found" };
  }

  const geo = await geocodeAddress(address);

  const row = {
    partner_id: authed.partnerId,
    label: input.label.trim() || null,
    address,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    area: geo?.area ?? null,
    neighborhood: geo?.neighborhood ?? null,
  };

  const { data, error } = input.id
    ? await supabase
        .from("partner_locations")
        .update(row)
        .eq("id", input.id)
        .select("id, label, address, area, neighborhood")
        .single()
    : await supabase
        .from("partner_locations")
        .insert(row)
        .select("id, label, address, area, neighborhood")
        .single();

  if (error || !data) {
    console.error("[upsertPartnerLocation] write error:", error?.message);
    return { success: false, error: "Couldn't save — try again" };
  }
  return { success: true, location: data as PartnerLocation };
}

export async function deletePartnerLocation(
  accessToken: string,
  locationId: string,
): Promise<{ success: boolean; error?: string }> {
  const authed = await requirePartner(accessToken);
  if (!authed) return { success: false, error: "Not signed in" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("partner_locations")
    .delete()
    .eq("id", locationId)
    .eq("partner_id", authed.partnerId); // ownership check baked into the delete itself

  if (error) {
    console.error("[deletePartnerLocation] delete error:", error.message);
    return { success: false, error: "Couldn't delete — try again" };
  }
  return { success: true };
}

export type PartnerLeadInput = {
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  note: string;
};

/**
 * Public, unauthenticated — the fallback shown by PartnerLoginRequest when
 * a typed email isn't a recognized partner. No account, no perk, just an
 * inbound-interest record: saved to partner_leads (status defaults to
 * 'new') and an email straight to Alex so she sees it right away, same as
 * she would a cold-outreach reply. See db/migrations/024_partner_leads.sql.
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
  const email = input.email.trim().toLowerCase();
  const note = input.note.trim();
  if (!firstName || !lastName || !businessName || !email || !note) {
    return { success: false, error: "All fields are required" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("partner_leads").insert({
    first_name: firstName,
    last_name: lastName,
    business_name: businessName,
    email,
    note,
  });

  if (error) {
    console.error("[submitPartnerLead] insert error:", error.message);
    return { success: false, error: "Couldn't submit — try again" };
  }

  // Fire-and-forget — the lead is already saved above regardless of whether
  // this notification email succeeds.
  try {
    await sendPartnerLeadEmail({ firstName, lastName, businessName, email, note });
  } catch (emailError) {
    console.error("[submitPartnerLead] notification email failed:", emailError);
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Your Perks tab
// ---------------------------------------------------------------------------

export type PerkCategory = { id: string; name: string };

export type PartnerPerk = {
  id: string;
  status: "pending" | "coming_soon" | "published" | "rejected" | "archived";
  location_id: string | null;
  partner_link: string | null;
  perk_title: string;
  perk_description: string;
  perk_discount: string;
  redemption_instructions: string | null;
  perk_redemption_code: string | null;
  perk_redemption_url: string | null;
  expires_at: string | null;
  category_ids: string[];
};

export async function listPerkCategories(): Promise<PerkCategory[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("perk_categories")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) console.error("[listPerkCategories] query error:", error.message);
  return data ?? [];
}

export async function listPartnerPerks(accessToken: string): Promise<PartnerPerk[]> {
  const authed = await requirePartner(accessToken);
  if (!authed) return [];

  const supabase = createAdminClient();
  const { data: perks, error } = await supabase
    .from("perks")
    .select("id, status, location_id, partner_link, perk_title, perk_description, perk_discount, redemption_instructions, perk_redemption_code, perk_redemption_url, expires_at")
    .eq("partner_id", authed.partnerId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[listPartnerPerks] query error:", error.message);
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
  })) as PartnerPerk[];
}

export type PartnerPerkInput = {
  id?: string; // present = update, absent = create
  location_id: string | null;
  partner_link: string;
  perk_title: string;
  perk_description: string;
  perk_discount: string;
  redemption_instructions: string;
  perk_redemption_code: string;
  perk_redemption_url: string;
  expires_at: string; // "" = no expiry
  category_ids: string[];
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

  const title = input.perk_title.trim();
  const description = input.perk_description.trim();
  const discount = input.perk_discount.trim();
  if (!title || !description || !discount) {
    return { success: false, error: "Title, description, and discount are required" };
  }

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

  // location_id, if set, must actually belong to this partner.
  if (input.location_id) {
    const { data: loc } = await supabase
      .from("partner_locations")
      .select("id")
      .eq("id", input.location_id)
      .eq("partner_id", authed.partnerId)
      .maybeSingle();
    if (!loc) return { success: false, error: "Location not found" };
  }

  const row = {
    partner_id: authed.partnerId,
    source: "partner_portal" as const,
    status: "pending" as const,
    location_id: input.location_id,
    partner_link: input.partner_link.trim() || null,
    perk_title: title,
    perk_description: description,
    perk_discount: discount,
    redemption_instructions: input.redemption_instructions.trim() || null,
    perk_redemption_code: input.perk_redemption_code.trim() || null,
    perk_redemption_url: input.perk_redemption_url.trim() || null,
    expires_at: input.expires_at || null,
  };

  const { data: perk, error } = input.id
    ? await supabase.from("perks").update(row).eq("id", input.id).select("id").single()
    : await supabase.from("perks").insert(row).select("id").single();

  if (error || !perk) {
    console.error("[savePartnerPerk] write error:", error?.message);
    return { success: false, error: "Couldn't save — try again" };
  }

  // Category links: delete + re-insert is simplest and correct here — a
  // perk has at most a handful of categories, no ordering to preserve.
  await supabase.from("perks_category_links").delete().eq("perk_id", perk.id);
  if (input.category_ids.length > 0) {
    await supabase.from("perks_category_links").insert(
      input.category_ids.map((category_id) => ({ perk_id: perk.id, category_id })),
    );
  }

  return { success: true, perkId: perk.id as string };
}
