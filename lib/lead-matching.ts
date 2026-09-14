import type { createAdminClient } from "@/lib/supabase";
import { createLeadNote, type LeadNote } from "@/lib/lead-notes";

type AdminClient = ReturnType<typeof createAdminClient>;

type MatchCandidate = {
  id: string;
  business_name: string;
  url: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  notes: LeadNote[];
  status: string;
};

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}

/**
 * Finds an existing partner_leads row that's clearly the same business —
 * an exact (case/whitespace-insensitive) match on business name or URL.
 * Deliberately 1:1, not fuzzy: Alex would rather scan the leads list
 * herself (sorted alphabetically) to catch near-duplicates ("Joe's Coffee"
 * vs "Joes Coffee Shop") than have a heuristic guess wrong and silently
 * merge two different businesses together.
 */
export async function findMatchingLead(
  supabase: AdminClient,
  businessName: string,
  url: string,
): Promise<MatchCandidate | null> {
  const { data, error } = await supabase
    .from("partner_leads")
    .select("id, business_name, url, first_name, last_name, email, notes, status");
  if (error || !data) return null;

  const normBusiness = businessName.trim().toLowerCase();
  const normUrl = normalizeUrl(url);

  const match = (data as MatchCandidate[]).find(
    (lead) => lead.business_name.trim().toLowerCase() === normBusiness || normalizeUrl(lead.url) === normUrl,
  );
  return match ?? null;
}

/**
 * Folds a new inbound submission into an already-matched lead instead of
 * creating a duplicate row: appends the new note to its log, backfills any
 * contact field the existing lead was missing, and — only when the
 * existing lead is still an 'idea' — bumps status to 'new', since an
 * actual submission is a stronger signal than Alex's own guess. Any other
 * status (contacted/converted/rejected) is left as-is; only the note and
 * any missing contact info get added, so a closed lead's history isn't
 * silently reopened.
 */
export async function mergeIntoLead(
  supabase: AdminClient,
  existing: MatchCandidate,
  input: { note: string; firstName?: string; lastName?: string; email?: string },
): Promise<{ success: boolean; error?: string }> {
  const update: Record<string, unknown> = {
    notes: [...(existing.notes ?? []), createLeadNote(input.note)],
  };
  if (!existing.first_name && input.firstName) update.first_name = input.firstName;
  if (!existing.last_name && input.lastName) update.last_name = input.lastName;
  if (!existing.email && input.email) update.email = input.email;
  if (existing.status === "idea") update.status = "new";

  const { error } = await supabase.from("partner_leads").update(update).eq("id", existing.id);
  if (error) {
    console.error("[mergeIntoLead] update error:", error.message);
    return { success: false, error: "Couldn't save — try again" };
  }
  return { success: true };
}
