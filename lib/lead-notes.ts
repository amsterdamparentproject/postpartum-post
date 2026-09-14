import { randomUUID } from "crypto";

/**
 * partner_leads.notes shape (db/migrations/024_perks.sql):
 * a jsonb array of dated entries rather than one static blurb, so Alex can
 * keep a running log on a lead over time ("reached out 9/13", "followed up
 * 9/20") instead of only ever seeing what was true at submission time.
 *
 * `id` exists because `date` alone isn't a safe key — nothing stops two
 * entries landing on the same day, and an id lets a specific entry be
 * edited (addLeadNote/editLeadNote in app/admin/partners/actions.ts)
 * without relying on array position.
 */
export type LeadNote = {
  id: string;
  date: string; // ISO timestamp — when the note was added, not user-editable
  note: string;
};

export function createLeadNote(text: string): LeadNote {
  return { id: randomUUID(), date: new Date().toISOString(), note: text };
}
