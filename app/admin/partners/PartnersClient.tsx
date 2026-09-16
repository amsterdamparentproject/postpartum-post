"use client";

import { useEffect, useState, useTransition } from "react";
import {
  listPartnerLeads,
  setLeadStatus,
  convertLeadToPartner,
  addPartner,
  addPartnerLeadIdea,
  addLeadNote,
  editLeadNote,
  deleteLeadNote,
  updateLeadDetails,
  deleteLead,
  listPerksForReview,
  setPerkStatus,
  listPartners,
  listPartnerLocations,
  addPerkForPartner,
  updatePartner,
  deletePartner,
  updatePerkAdmin,
  type PartnerLead,
  type LeadStatus,
  type ReviewPerk,
  type PerkReviewStatus,
  type PartnerOption,
  type PartnerLocationOption,
} from "./actions";
import { listPerkCategories, type PerkCategory } from "@/app/actions/partners";
import type { LeadNote } from "@/lib/lead-notes";
import RequiredMark from "@/components/RequiredMark";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition text-sm";
const labelClass = "block text-xs font-medium text-dark mb-1";

const LEAD_STATUS_STYLES: Record<PartnerLead["status"], string> = {
  idea: "bg-purple-50 text-purple-700 border-purple-200",
  new: "bg-amber-50 text-amber-700 border-amber-200",
  contacted: "bg-blue-50 text-blue-700 border-blue-200",
  converted: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-gray-100 text-muted border-border",
};

const LEAD_STATUS_LABELS: Record<PartnerLead["status"], string> = {
  idea: "Idea",
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  rejected: "Not a fit",
};

const PERK_STATUS_STYLES: Record<PerkReviewStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  coming_soon: "bg-blue-50 text-blue-700 border-blue-200",
  published: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-coral/10 text-coral border-coral/30",
  archived: "bg-gray-100 text-muted border-border",
};

const PERK_STATUS_LABELS: Record<PerkReviewStatus, string> = {
  pending: "In review",
  coming_soon: "Coming soon",
  published: "Live",
  rejected: "Not approved",
  archived: "Archived",
};

function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${className}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Leads tab
// ---------------------------------------------------------------------------

function ConvertLeadForm({
  lead,
  onDone,
  onCancel,
}: {
  lead: PartnerLead;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState(lead.first_name ?? "");
  const [lastName, setLastName] = useState(lead.last_name ?? "");
  const [businessName, setBusinessName] = useState(lead.business_name);
  const [url, setUrl] = useState(lead.url);
  const [email, setEmail] = useState(lead.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await convertLeadToPartner({ leadId: lead.id, firstName, lastName, businessName, url, email });
      if (!result.success) {
        setError(result.error ?? "Couldn't convert — try again");
        return;
      }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-border space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First name <RequiredMark /></label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Last name <RequiredMark /></label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} required className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Business name <RequiredMark /></label>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Website <RequiredMark /></label>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Login email <RequiredMark /></label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
      </div>
      {error && <p className="text-xs text-coral">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Create partner + mark converted"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-dark transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

function PencilIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

/**
 * Renders a lead's dated notes log (see lib/lead-notes.ts), plus a small
 * "+ Note" button to append a new entry, a pencil icon per entry to
 * correct its text in place, and a trash icon to remove it — same icon
 * pair as the lead-level edit/delete. date is never editable — it marks
 * when the note was originally added.
 */
function NotesLog({ leadId, notes, onChanged }: { leadId: string; notes: LeadNote[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addLeadNote(leadId, draft);
      if (!result.success) {
        setError(result.error ?? "Couldn't save — try again");
        return;
      }
      setDraft("");
      setAdding(false);
      onChanged();
    });
  }

  function submitEdit(e: React.FormEvent, noteId: string) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await editLeadNote(leadId, noteId, editDraft);
      if (!result.success) {
        setError(result.error ?? "Couldn't save — try again");
        return;
      }
      setEditingId(null);
      onChanged();
    });
  }

  function handleDeleteNote(noteId: string) {
    startTransition(async () => {
      const result = await deleteLeadNote(leadId, noteId);
      if (!result.success) {
        setError(result.error ?? "Couldn't delete — try again");
        return;
      }
      setDeletingId(null);
      onChanged();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {notes.map((entry) => (
        <div key={entry.id} className="text-sm text-dark leading-relaxed bg-cream/60 rounded-lg px-3 py-2">
          {editingId === entry.id ? (
            <form onSubmit={(e) => submitEdit(e, entry.id)} className="space-y-2">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={2}
                required
                className={inputClass}
                autoFocus
              />
              <div className="flex gap-3">
                <button type="submit" disabled={isPending} className="text-xs font-semibold text-coral hover:text-coral-dark transition">
                  Save
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-xs text-muted hover:text-dark transition">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="whitespace-pre-wrap">{entry.note}</p>
                {deletingId === entry.id ? (
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-xs text-muted whitespace-nowrap">Delete?</span>
                    <button
                      onClick={() => handleDeleteNote(entry.id)}
                      disabled={isPending}
                      className="text-xs font-semibold text-coral hover:text-coral-dark transition"
                    >
                      Yes
                    </button>
                    <button onClick={() => setDeletingId(null)} className="text-xs text-muted hover:text-dark transition">
                      No
                    </button>
                  </div>
                ) : (
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => { setEditingId(entry.id); setEditDraft(entry.note); }}
                      aria-label="Edit note"
                      className="p-1 text-muted hover:text-coral transition"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => setDeletingId(entry.id)}
                      aria-label="Delete note"
                      className="p-1 text-muted hover:text-coral transition"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted mt-1">{new Date(entry.date).toLocaleDateString()}</p>
            </>
          )}
        </div>
      ))}

      {adding ? (
        <form onSubmit={submitAdd} className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            required
            className={inputClass}
            placeholder="New update…"
            autoFocus
          />
          <div className="flex gap-3">
            <button type="submit" disabled={isPending} className="text-xs font-semibold text-coral hover:text-coral-dark transition">
              {isPending ? "Saving…" : "Save note"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setDraft(""); }} className="text-xs text-muted hover:text-dark transition">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs font-semibold text-coral hover:text-coral-dark transition">
          + Note
        </button>
      )}
      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  );
}

/**
 * Edits business_name/url/contact fields in place — separate from
 * ConvertLeadForm, which pre-fills the same fields but is a one-way
 * "become a real partner" action. This is just fixing a typo or filling
 * in contact info later, with no status change attached.
 */
function EditLeadForm({
  lead,
  onDone,
  onCancel,
}: {
  lead: PartnerLead;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [businessName, setBusinessName] = useState(lead.business_name);
  const [url, setUrl] = useState(lead.url);
  const [firstName, setFirstName] = useState(lead.first_name ?? "");
  const [lastName, setLastName] = useState(lead.last_name ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateLeadDetails({ leadId: lead.id, businessName, url, firstName, lastName, email });
      if (!result.success) {
        setError(result.error ?? "Couldn't save — try again");
        return;
      }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-border space-y-3">
      <div>
        <label className={labelClass}>Business name <RequiredMark /></label>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Website <RequiredMark /></label>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First name</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} placeholder="Optional" />
        </div>
        <div>
          <label className={labelClass}>Last name</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} placeholder="Optional" />
        </div>
      </div>
      <div>
        <label className={labelClass}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Optional" />
      </div>
      {error && <p className="text-xs text-coral">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-dark transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

const EDITABLE_STATUSES = ["idea", "new", "contacted", "rejected"] as const;

function LeadCard({ lead, onChanged }: { lead: PartnerLead; onChanged: () => void }) {
  const [converting, setConverting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function changeStatus(status: Exclude<LeadStatus, "converted">) {
    if (status === lead.status) return;
    startTransition(async () => {
      await setLeadStatus(lead.id, status);
      onChanged();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteLead(lead.id);
      onChanged();
    });
  }

  const contactLine = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  const showIcons = !editing && !converting;

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-dark">{lead.business_name}</p>
          <a
            href={lead.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted hover:text-coral transition-colors underline underline-offset-2"
          >
            {lead.url}
          </a>
          {(contactLine || lead.email) ? (
            <p className="text-sm text-muted mt-1">
              {contactLine}
              {contactLine && lead.email ? " · " : ""}
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="hover:text-coral transition-colors">{lead.email}</a>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted italic mt-1">No contact yet</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editing && lead.status !== "converted" ? (
            <div className="flex flex-wrap gap-1 justify-end">
              {EDITABLE_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => changeStatus(s)}
                  disabled={isPending}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    lead.status === s
                      ? LEAD_STATUS_STYLES[s]
                      : "bg-white text-muted border-border hover:border-dark/30 hover:text-dark"
                  }`}
                >
                  {LEAD_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          ) : (
            <StatusBadge label={LEAD_STATUS_LABELS[lead.status]} className={LEAD_STATUS_STYLES[lead.status]} />
          )}
          {showIcons && !confirmingDelete && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditing(true)}
                aria-label="Edit lead"
                className="p-1 text-muted hover:text-coral transition"
              >
                <PencilIcon />
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete lead"
                className="p-1 text-muted hover:text-coral transition"
              >
                <TrashIcon />
              </button>
            </div>
          )}
          {showIcons && confirmingDelete && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted whitespace-nowrap">Delete?</span>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-xs font-semibold text-coral hover:text-coral-dark transition"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-xs text-muted hover:text-dark transition"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>
      <NotesLog leadId={lead.id} notes={lead.notes} onChanged={onChanged} />
      <p className="text-xs text-muted mt-2">Submitted {new Date(lead.created_at).toLocaleDateString()}</p>

      {showIcons && lead.status !== "converted" && (
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-border">
          <button
            onClick={() => setConverting(true)}
            className="text-sm font-semibold text-coral hover:text-coral-dark transition"
          >
            Convert to partner
          </button>
          {lead.status !== "contacted" && (
            <button
              onClick={() => changeStatus("contacted")}
              disabled={isPending}
              className="text-sm text-muted hover:text-dark transition"
            >
              Mark contacted
            </button>
          )}
          {lead.status !== "rejected" && (
            <button
              onClick={() => changeStatus("rejected")}
              disabled={isPending}
              className="text-sm text-muted hover:text-dark transition"
            >
              Not a fit
            </button>
          )}
        </div>
      )}

      {converting && (
        <ConvertLeadForm lead={lead} onDone={onChanged} onCancel={() => setConverting(false)} />
      )}

      {editing && (
        <EditLeadForm lead={lead} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
      )}

      {lead.status === "converted" && showIcons && (
        <p className="text-xs text-muted mt-2">Converted to partner</p>
      )}
    </div>
  );
}

function AddIdeaLeadForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [businessName, setBusinessName] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addPartnerLeadIdea({ businessName, url, note, firstName, lastName, email });
      if (!result.success) {
        setError(result.error ?? "Couldn't save — try again");
        return;
      }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 space-y-3">
      <h3 className="text-sm font-semibold text-dark">Add a potential partner</h3>
      <p className="text-xs text-muted -mt-2">
        A business you want to reach out to, marked with an &quot;Idea&quot; status so it&apos;s clear
        it didn&apos;t come in through the lead form. Contact name and email are optional — add them
        once you&apos;ve actually talked to someone there.
      </p>
      <div>
        <label className={labelClass}>Business name <RequiredMark /></label>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Website <RequiredMark /></label>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required className={inputClass} placeholder="https://" />
      </div>
      <div>
        <label className={labelClass}>Why <RequiredMark /></label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} required className={inputClass} placeholder="What perk or angle you have in mind" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First name</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} placeholder="Optional" />
        </div>
        <div>
          <label className={labelClass}>Last name</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} placeholder="Optional" />
        </div>
      </div>
      <div>
        <label className={labelClass}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Optional" />
      </div>
      {error && <p className="text-xs text-coral">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save idea"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-dark transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddPartnerForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addPartner({ firstName, lastName, businessName, email });
      if (!result.success) {
        setError(result.error ?? "Couldn't create — try again");
        return;
      }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 space-y-3">
      <h3 className="text-sm font-semibold text-dark">Add partner directly</h3>
      <p className="text-xs text-muted -mt-2">
        For a business or contributor outside the lead-capture flow. Leave email blank if they
        don&apos;t need portal access yet.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First name <RequiredMark /></label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Last name <RequiredMark /></label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} required className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Business name <RequiredMark /></label>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Login email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Optional — no email means no portal access yet" />
      </div>
      {error && <p className="text-xs text-coral">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Add partner"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-dark transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

const LEAD_STATUS_FILTERS: Array<{ value: LeadStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "idea", label: "Idea" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
  { value: "rejected", label: "Not a fit" },
];

type LeadStatusFilter = PartnerLead["status"] | "all";

function LeadsTab() {
  const [leads, setLeads] = useState<PartnerLead[] | null>(null);
  const [addingIdea, setAddingIdea] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>("all");

  function reload() {
    listPartnerLeads().then(setLeads);
  }

  useEffect(() => {
    reload();
  }, []);

  const filteredLeads =
    statusFilter === "all" ? leads ?? [] : (leads ?? []).filter((l) => l.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>Leads</h2>
        {!addingIdea && (
          <button
            onClick={() => setAddingIdea(true)}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-coral text-coral hover:bg-coral/10 transition"
          >
            + Add idea
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LEAD_STATUS_FILTERS.map((f) => {
          const count = f.value === "all" ? leads?.length ?? 0 : leads?.filter((l) => l.status === f.value).length ?? 0;
          const active = statusFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "bg-dark text-white border-dark"
                  : "bg-white text-muted border-border hover:text-dark hover:border-dark/30"
              }`}
            >
              {f.label} · {count}
            </button>
          );
        })}
      </div>

      {addingIdea && (
        <AddIdeaLeadForm
          onDone={() => { setAddingIdea(false); reload(); }}
          onCancel={() => setAddingIdea(false)}
        />
      )}

      {leads === null && <p className="text-sm text-muted">Loading…</p>}
      {leads?.length === 0 && <p className="text-sm text-muted">No leads yet.</p>}
      {leads && leads.length > 0 && filteredLeads.length === 0 && (
        <p className="text-sm text-muted">No leads with this status.</p>
      )}

      {filteredLeads.length > 0 && (
        <div className="space-y-3">
          {filteredLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Partners tab — every row in the `partners` table, whether it arrived via
// a converted lead or was added directly ("+ Add partner" below). Leads
// stays purely about outreach/conversion tracking; this is the actual
// partner directory, and the one place a directly-added partner (which
// never has a partner_leads row at all) is visible in admin.
// ---------------------------------------------------------------------------

/**
 * Edits a partner's business name/url/contact fields in place — same
 * shape and fields as EditLeadForm, just keyed on partners instead of
 * partner_leads (updatePartner mirrors updateLeadDetails).
 */
function EditPartnerForm({
  partner,
  onDone,
  onCancel,
}: {
  partner: PartnerOption;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [businessName, setBusinessName] = useState(partner.business_name);
  const [url, setUrl] = useState(partner.url ?? "");
  const [firstName, setFirstName] = useState(partner.first_name);
  const [lastName, setLastName] = useState(partner.last_name);
  const [email, setEmail] = useState(partner.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updatePartner({ partnerId: partner.id, businessName, url, firstName, lastName, email });
      if (!result.success) {
        setError(result.error ?? "Couldn't save — try again");
        return;
      }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-border space-y-3">
      <div>
        <label className={labelClass}>Business name <RequiredMark /></label>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Website</label>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="Optional" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First name <RequiredMark /></label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Last name <RequiredMark /></label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} required className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Login email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Optional — no email means no portal access" />
      </div>
      {error && <p className="text-xs text-coral">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-dark transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * A partner's row on the Partners tab — same pencil/trash icon pair and
 * confirm-before-delete pattern as LeadCard, minus the lead-only bits
 * (status pills, convert, notes log) that don't apply here.
 */
function PartnerCard({ partner, onChanged }: { partner: PartnerOption; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deletePartner(partner.id);
      onChanged();
    });
  }

  const showIcons = !editing;

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-dark">{partner.business_name}</p>
          <p className="text-sm text-muted mt-0.5">
            {partner.first_name} {partner.last_name}
            {partner.email && " · "}
            {partner.email && (
              <a href={`mailto:${partner.email}`} className="hover:text-coral transition-colors">{partner.email}</a>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!partner.email && (
            <StatusBadge label="No portal access yet" className="bg-gray-100 text-muted border-border" />
          )}
          {showIcons && !confirmingDelete && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditing(true)}
                aria-label="Edit partner"
                className="p-1 text-muted hover:text-coral transition"
              >
                <PencilIcon />
              </button>
              <button
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete partner"
                className="p-1 text-muted hover:text-coral transition"
              >
                <TrashIcon />
              </button>
            </div>
          )}
          {showIcons && confirmingDelete && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted whitespace-nowrap">Delete?</span>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-xs font-semibold text-coral hover:text-coral-dark transition"
              >
                Yes
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="text-xs text-muted hover:text-dark transition">
                No
              </button>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EditPartnerForm
          partner={partner}
          onDone={() => { setEditing(false); onChanged(); }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function PartnersTab() {
  const [partners, setPartners] = useState<PartnerOption[] | null>(null);
  const [addingPartner, setAddingPartner] = useState(false);

  function reload() {
    listPartners().then(setPartners);
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>Partners</h2>
        {!addingPartner && (
          <button
            onClick={() => setAddingPartner(true)}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition"
          >
            + Add partner
          </button>
        )}
      </div>

      {addingPartner && (
        <AddPartnerForm
          onDone={() => { setAddingPartner(false); reload(); }}
          onCancel={() => setAddingPartner(false)}
        />
      )}

      {partners === null && <p className="text-sm text-muted">Loading…</p>}
      {partners?.length === 0 && <p className="text-sm text-muted">No partners yet.</p>}

      <div className="space-y-3">
        {partners?.map((p) => (
          <PartnerCard key={p.id} partner={p} onChanged={reload} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Perks tab
// ---------------------------------------------------------------------------

/**
 * Alex adding a perk herself and attaching it to a partner she's already
 * worked out the details with — no lead-capture or partner-portal signup
 * needed first. Mirrors PartnerPerkForm's field set, but this one picks
 * the partner explicitly (locations/categories load once one's chosen)
 * and trusts the admin-picked status directly instead of forcing
 * 'pending' — see addPerkForPartner's docblock. Either way, the perk
 * shows up in that partner's own "Your Perks" tab right away.
 */
function AdminPerkForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [partners, setPartners] = useState<PartnerOption[] | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const [locations, setLocations] = useState<PartnerLocationOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [categories, setCategories] = useState<PerkCategory[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [status, setStatus] = useState<PerkReviewStatus>("published");
  const [partnerLink, setPartnerLink] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discount, setDiscount] = useState("");
  const [instructions, setInstructions] = useState("");
  const [code, setCode] = useState("");
  const [redemptionUrl, setRedemptionUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listPartners().then(setPartners);
    listPerkCategories().then(setCategories);
  }, []);

  // All setState calls stay inside the .then() callback (never synchronous
  // in the effect body) — same pattern PartnerPerksManager uses, and what
  // the set-state-in-effect lint rule requires.
  useEffect(() => {
    (partnerId ? listPartnerLocations(partnerId) : Promise.resolve([])).then((locs) => {
      setLocations(locs);
      setLocationId("");
    });
  }, [partnerId]);

  function toggleCategory(id: string) {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!partnerId) {
      setError("Pick a partner first");
      return;
    }
    startTransition(async () => {
      const result = await addPerkForPartner({
        partner_id: partnerId,
        location_id: locationId || null,
        partner_link: partnerLink,
        perk_title: title,
        perk_description: description,
        perk_discount: discount,
        redemption_instructions: instructions,
        perk_redemption_code: code,
        perk_redemption_url: redemptionUrl,
        expires_at: expiresAt,
        exclusive,
        category_ids: categoryIds,
        status,
      });
      if (!result.success) {
        setError(result.error ?? "Couldn't save — try again");
        return;
      }
      onDone();
    });
  }

  const selectedPartner = partners?.find((p) => p.id === partnerId) ?? null;

  return (
    <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 space-y-4">
      <h3 className="text-sm font-semibold text-dark">Add perk for a partner</h3>

      <div>
        <label className={labelClass}>Partner <RequiredMark /></label>
        <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} required className={inputClass}>
          <option value="">Select a partner…</option>
          {partners?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.business_name} ({p.first_name} {p.last_name}){p.email ? "" : " — no portal access yet"}
            </option>
          ))}
        </select>
        {selectedPartner && !selectedPartner.email && (
          <p className="text-xs text-muted mt-1">
            This partner has no login email yet, so they won&apos;t be able to see it in a portal until one&apos;s added on the Leads tab.
          </p>
        )}
      </div>

      <div>
        <label className={labelClass}>Perk title <RequiredMark /></label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClass} placeholder="20% off your first class" />
      </div>

      <div>
        <label className={labelClass}>Discount <RequiredMark /></label>
        <input value={discount} onChange={(e) => setDiscount(e.target.value)} required className={inputClass} placeholder="20% off, 1 free class, €10 off…" />
      </div>

      <div>
        <label className={labelClass}>Description <RequiredMark /></label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={3} className={inputClass} />
      </div>

      {locations.length > 0 && (
        <div>
          <label className={labelClass}>Location</label>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass}>
            <option value="">Not tied to a specific location</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.label || loc.address}</option>
            ))}
          </select>
        </div>
      )}

      {categories.length > 0 && (
        <div>
          <label className={labelClass}>Category</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const active = categoryIds.includes(cat.id);
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition ${
                    active ? "bg-coral text-white border-coral" : "border-border text-muted hover:text-dark"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Redemption code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} placeholder="Optional" />
        </div>
        <div>
          <label className={labelClass}>Redemption link</label>
          <input value={redemptionUrl} onChange={(e) => setRedemptionUrl(e.target.value)} className={inputClass} placeholder="Optional" />
        </div>
      </div>

      <div>
        <label className={labelClass}>How members redeem it</label>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} className={inputClass} placeholder="e.g. Show this code at checkout" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Perk-specific link</label>
          <input value={partnerLink} onChange={(e) => setPartnerLink(e.target.value)} className={inputClass} placeholder="If different from their website" />
        </div>
        <div>
          <label className={labelClass}>Expires</label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as PerkReviewStatus)} className={inputClass}>
          {(Object.keys(PERK_STATUS_LABELS) as PerkReviewStatus[]).map((s) => (
            <option key={s} value={s}>{PERK_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-dark">
        <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
        Exclusive to Postpartum Post
      </label>

      {error && <p className="text-xs text-coral">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Add perk"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-dark transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Full-content edit for a perk from the admin queue — title, discount,
 * description, location/category/redemption details, and status all in
 * one form, via updatePerkAdmin. Same field set as AdminPerkForm (the
 * "+ Add perk" form) minus the partner picker: partner_id isn't editable
 * here (see updatePerkAdmin's docblock), so locations/categories load
 * immediately for this perk's own partner rather than waiting on a
 * selection.
 */
function EditPerkForm({
  perk,
  onDone,
  onCancel,
}: {
  perk: ReviewPerk;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [locations, setLocations] = useState<PartnerLocationOption[]>([]);
  const [categories, setCategories] = useState<PerkCategory[]>([]);
  const [locationId, setLocationId] = useState(perk.location_id ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(perk.category_ids);
  const [status, setStatus] = useState<PerkReviewStatus>(perk.status);
  const [partnerLink, setPartnerLink] = useState(perk.partner_link ?? "");
  const [title, setTitle] = useState(perk.perk_title);
  const [description, setDescription] = useState(perk.perk_description);
  const [discount, setDiscount] = useState(perk.perk_discount);
  const [instructions, setInstructions] = useState(perk.redemption_instructions ?? "");
  const [code, setCode] = useState(perk.perk_redemption_code ?? "");
  const [redemptionUrl, setRedemptionUrl] = useState(perk.perk_redemption_url ?? "");
  const [expiresAt, setExpiresAt] = useState(perk.expires_at ?? "");
  const [exclusive, setExclusive] = useState(perk.exclusive);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    Promise.all([listPartnerLocations(perk.partner_id), listPerkCategories()]).then(([locs, cats]) => {
      setLocations(locs);
      setCategories(cats);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCategory(id: string) {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updatePerkAdmin({
        perkId: perk.id,
        status,
        location_id: locationId || null,
        partner_link: partnerLink,
        perk_title: title,
        perk_description: description,
        perk_discount: discount,
        redemption_instructions: instructions,
        perk_redemption_code: code,
        perk_redemption_url: redemptionUrl,
        expires_at: expiresAt,
        exclusive,
        category_ids: categoryIds,
      });
      if (!result.success) {
        setError(result.error ?? "Couldn't save — try again");
        return;
      }
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 pt-4 border-t border-border space-y-4">
      <div>
        <label className={labelClass}>Perk title <RequiredMark /></label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Discount <RequiredMark /></label>
        <input value={discount} onChange={(e) => setDiscount(e.target.value)} required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Description <RequiredMark /></label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={3} className={inputClass} />
      </div>

      {locations.length > 0 && (
        <div>
          <label className={labelClass}>Location</label>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={inputClass}>
            <option value="">Not tied to a specific location</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.label || loc.address}</option>
            ))}
          </select>
        </div>
      )}

      {categories.length > 0 && (
        <div>
          <label className={labelClass}>Category</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const active = categoryIds.includes(cat.id);
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition ${
                    active ? "bg-coral text-white border-coral" : "border-border text-muted hover:text-dark"
                  }`}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Redemption code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} className={inputClass} placeholder="Optional" />
        </div>
        <div>
          <label className={labelClass}>Redemption link</label>
          <input value={redemptionUrl} onChange={(e) => setRedemptionUrl(e.target.value)} className={inputClass} placeholder="Optional" />
        </div>
      </div>

      <div>
        <label className={labelClass}>How members redeem it</label>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} className={inputClass} placeholder="e.g. Show this code at checkout" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Perk-specific link</label>
          <input value={partnerLink} onChange={(e) => setPartnerLink(e.target.value)} className={inputClass} placeholder="If different from their website" />
        </div>
        <div>
          <label className={labelClass}>Expires</label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as PerkReviewStatus)} className={inputClass}>
          {(Object.keys(PERK_STATUS_LABELS) as PerkReviewStatus[]).map((s) => (
            <option key={s} value={s}>{PERK_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-dark">
        <input type="checkbox" checked={exclusive} onChange={(e) => setExclusive(e.target.checked)} />
        Exclusive to Postpartum Post
      </label>

      {error && <p className="text-xs text-coral">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-dark transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

function PerkCard({ perk, onChanged }: { perk: ReviewPerk; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  function updateStatus(status: PerkReviewStatus) {
    startTransition(async () => {
      await setPerkStatus(perk.id, status);
      onChanged();
    });
  }

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-dark">{perk.perk_title}</p>
            {perk.exclusive && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-light/30 text-dark">
                Exclusive
              </span>
            )}
          </div>
          <p className="text-sm text-muted mt-0.5">{perk.partner_name} · {perk.perk_discount}</p>
        </div>
        <StatusBadge label={PERK_STATUS_LABELS[perk.status]} className={PERK_STATUS_STYLES[perk.status]} />
      </div>
      <p className="text-sm text-dark leading-relaxed mt-3">{perk.perk_description}</p>
      <p className="text-xs text-muted mt-2">Submitted {new Date(perk.created_at).toLocaleDateString()}</p>

      {editing ? (
        <EditPerkForm
          perk={perk}
          onDone={() => { setEditing(false); onChanged(); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-border">
          <button onClick={() => setEditing(true)} className="text-sm text-muted hover:text-dark transition">
            Edit
          </button>
          {perk.status !== "published" && (
            <button onClick={() => updateStatus("published")} disabled={isPending} className="text-sm font-semibold text-coral hover:text-coral-dark transition">
              Approve
            </button>
          )}
          {perk.status !== "coming_soon" && (
            <button onClick={() => updateStatus("coming_soon")} disabled={isPending} className="text-sm text-muted hover:text-dark transition">
              Mark coming soon
            </button>
          )}
          {perk.status !== "rejected" && (
            <button onClick={() => updateStatus("rejected")} disabled={isPending} className="text-sm text-muted hover:text-dark transition">
              Reject
            </button>
          )}
          {perk.status !== "archived" && (
            <button onClick={() => updateStatus("archived")} disabled={isPending} className="text-sm text-muted hover:text-dark transition">
              Archive
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const PERK_STATUS_FILTERS: Array<{ value: PerkStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: PERK_STATUS_LABELS.pending },
  { value: "coming_soon", label: PERK_STATUS_LABELS.coming_soon },
  { value: "published", label: PERK_STATUS_LABELS.published },
  { value: "rejected", label: PERK_STATUS_LABELS.rejected },
  { value: "archived", label: PERK_STATUS_LABELS.archived },
];

type PerkStatusFilter = PerkReviewStatus | "all";

function PerksTab() {
  const [perks, setPerks] = useState<ReviewPerk[] | null>(null);
  const [addingPerk, setAddingPerk] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PerkStatusFilter>("pending");

  function reload() {
    listPerksForReview().then(setPerks);
  }

  useEffect(() => {
    reload();
  }, []);

  const filteredPerks =
    statusFilter === "all" ? perks ?? [] : (perks ?? []).filter((p) => p.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>Perks</h2>
        {!addingPerk && (
          <button
            onClick={() => setAddingPerk(true)}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition"
          >
            + Add perk
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PERK_STATUS_FILTERS.map((f) => {
          const count = f.value === "all" ? perks?.length ?? 0 : perks?.filter((p) => p.status === f.value).length ?? 0;
          const active = statusFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                active
                  ? "bg-dark text-white border-dark"
                  : "bg-white text-muted border-border hover:text-dark hover:border-dark/30"
              }`}
            >
              {f.label} · {count}
            </button>
          );
        })}
      </div>

      {addingPerk && (
        <AdminPerkForm
          onDone={() => { setAddingPerk(false); reload(); }}
          onCancel={() => setAddingPerk(false)}
        />
      )}

      {perks === null && <p className="text-sm text-muted">Loading…</p>}
      {perks?.length === 0 && <p className="text-sm text-muted">No perks submitted yet.</p>}
      {perks && perks.length > 0 && filteredPerks.length === 0 && (
        <p className="text-sm text-muted">No perks with this status.</p>
      )}

      {filteredPerks.length > 0 && (
        <div className="space-y-3">
          {filteredPerks.map((perk) => (
            <PerkCard key={perk.id} perk={perk} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

type SubTab = "leads" | "partners" | "perks";

export default function PartnersClient() {
  const [tab, setTab] = useState<SubTab>("leads");
  const base = "text-sm font-medium px-3 py-1.5 rounded-lg transition-colors";
  const on = `${base} bg-dark text-white`;
  const off = `${base} text-muted hover:text-dark`;

  return (
    <div className="space-y-6">
      <nav className="flex gap-1">
        <button onClick={() => setTab("leads")} className={tab === "leads" ? on : off}>Leads</button>
        <button onClick={() => setTab("partners")} className={tab === "partners" ? on : off}>Partners</button>
        <button onClick={() => setTab("perks")} className={tab === "perks" ? on : off}>Perks</button>
      </nav>
      {tab === "leads" ? <LeadsTab /> : tab === "partners" ? <PartnersTab /> : <PerksTab />}
    </div>
  );
}
