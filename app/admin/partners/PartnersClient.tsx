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
  listPerksForReview,
  setPerkStatus,
  type PartnerLead,
  type ReviewPerk,
  type PerkReviewStatus,
} from "./actions";
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

/**
 * Renders a lead's dated notes log (see lib/lead-notes.ts), plus a small
 * "+ Note" button to append a new entry and a per-entry "Edit" to correct
 * one's text in place. date is never editable — it marks when the note
 * was originally added.
 */
function NotesLog({ leadId, notes, onChanged }: { leadId: string; notes: LeadNote[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
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
                <button
                  onClick={() => { setEditingId(entry.id); setEditDraft(entry.note); }}
                  className="shrink-0 text-xs text-muted hover:text-coral transition"
                >
                  Edit
                </button>
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

function LeadCard({ lead, onChanged }: { lead: PartnerLead; onChanged: () => void }) {
  const [converting, setConverting] = useState(false);
  const [isPending, startTransition] = useTransition();

  function quickSetStatus(status: "contacted" | "rejected") {
    startTransition(async () => {
      await setLeadStatus(lead.id, status);
      onChanged();
    });
  }

  const contactLine = [lead.first_name, lead.last_name].filter(Boolean).join(" ");

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
        <StatusBadge label={LEAD_STATUS_LABELS[lead.status]} className={LEAD_STATUS_STYLES[lead.status]} />
      </div>
      <NotesLog leadId={lead.id} notes={lead.notes} onChanged={onChanged} />
      <p className="text-xs text-muted mt-2">Submitted {new Date(lead.created_at).toLocaleDateString()}</p>

      {lead.status !== "converted" && !converting && (
        <div className="flex gap-4 mt-4 pt-4 border-t border-border">
          <button
            onClick={() => setConverting(true)}
            className="text-sm font-semibold text-coral hover:text-coral-dark transition"
          >
            Convert to partner
          </button>
          {lead.status !== "contacted" && (
            <button
              onClick={() => quickSetStatus("contacted")}
              disabled={isPending}
              className="text-sm text-muted hover:text-dark transition"
            >
              Mark contacted
            </button>
          )}
          {lead.status !== "rejected" && (
            <button
              onClick={() => quickSetStatus("rejected")}
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

      {lead.status === "converted" && (
        <p className="text-xs text-muted mt-4 pt-4 border-t border-border">Converted to partner</p>
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

function LeadsTab() {
  const [leads, setLeads] = useState<PartnerLead[] | null>(null);
  const [addingPartner, setAddingPartner] = useState(false);
  const [addingIdea, setAddingIdea] = useState(false);

  function reload() {
    listPartnerLeads().then(setLeads);
  }

  useEffect(() => {
    reload();
  }, []);

  const openLeads = leads?.filter((l) => l.status === "idea" || l.status === "new" || l.status === "contacted") ?? [];
  const closedLeads = leads?.filter((l) => l.status === "converted" || l.status === "rejected") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>Leads</h2>
        {!addingPartner && !addingIdea && (
          <div className="flex gap-2">
            <button
              onClick={() => setAddingIdea(true)}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-coral text-coral hover:bg-coral/10 transition"
            >
              + Add idea
            </button>
            <button
              onClick={() => setAddingPartner(true)}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition"
            >
              + Add partner
            </button>
          </div>
        )}
      </div>

      {addingIdea && (
        <AddIdeaLeadForm
          onDone={() => { setAddingIdea(false); reload(); }}
          onCancel={() => setAddingIdea(false)}
        />
      )}

      {addingPartner && (
        <AddPartnerForm
          onDone={() => { setAddingPartner(false); reload(); }}
          onCancel={() => setAddingPartner(false)}
        />
      )}

      {leads === null && <p className="text-sm text-muted">Loading…</p>}
      {leads?.length === 0 && <p className="text-sm text-muted">No leads yet.</p>}

      {openLeads.length > 0 && (
        <div className="space-y-3">
          {openLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onChanged={reload} />
          ))}
        </div>
      )}

      {closedLeads.length > 0 && (
        <details className="pt-2">
          <summary className="text-sm text-muted cursor-pointer hover:text-dark transition">
            {closedLeads.length} converted or not-a-fit lead{closedLeads.length === 1 ? "" : "s"}
          </summary>
          <div className="space-y-3 mt-3">
            {closedLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} onChanged={reload} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Perks tab
// ---------------------------------------------------------------------------

function PerkCard({ perk, onChanged }: { perk: ReviewPerk; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition();

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
          <p className="font-medium text-dark">{perk.perk_title}</p>
          <p className="text-sm text-muted mt-0.5">{perk.partner_name} · {perk.perk_discount}</p>
        </div>
        <StatusBadge label={PERK_STATUS_LABELS[perk.status]} className={PERK_STATUS_STYLES[perk.status]} />
      </div>
      <p className="text-sm text-dark leading-relaxed mt-3">{perk.perk_description}</p>
      <p className="text-xs text-muted mt-2">Submitted {new Date(perk.created_at).toLocaleDateString()}</p>

      <div className="flex gap-4 mt-4 pt-4 border-t border-border">
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
    </div>
  );
}

function PerksTab() {
  const [perks, setPerks] = useState<ReviewPerk[] | null>(null);

  function reload() {
    listPerksForReview().then(setPerks);
  }

  useEffect(() => {
    reload();
  }, []);

  const pending = perks?.filter((p) => p.status === "pending") ?? [];
  const rest = perks?.filter((p) => p.status !== "pending") ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>Perks</h2>

      {perks === null && <p className="text-sm text-muted">Loading…</p>}
      {perks?.length === 0 && <p className="text-sm text-muted">No perks submitted yet.</p>}

      {pending.length > 0 && (
        <div className="space-y-3">
          {pending.map((perk) => (
            <PerkCard key={perk.id} perk={perk} onChanged={reload} />
          ))}
        </div>
      )}
      {pending.length === 0 && perks && perks.length > 0 && (
        <p className="text-sm text-muted">Nothing waiting on review.</p>
      )}

      {rest.length > 0 && (
        <details className="pt-2">
          <summary className="text-sm text-muted cursor-pointer hover:text-dark transition">
            {rest.length} reviewed perk{rest.length === 1 ? "" : "s"}
          </summary>
          <div className="space-y-3 mt-3">
            {rest.map((perk) => (
              <PerkCard key={perk.id} perk={perk} onChanged={reload} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

type SubTab = "leads" | "perks";

export default function PartnersClient() {
  const [tab, setTab] = useState<SubTab>("leads");
  const base = "text-sm font-medium px-3 py-1.5 rounded-lg transition-colors";
  const on = `${base} bg-dark text-white`;
  const off = `${base} text-muted hover:text-dark`;

  return (
    <div className="space-y-6">
      <nav className="flex gap-1">
        <button onClick={() => setTab("leads")} className={tab === "leads" ? on : off}>Leads</button>
        <button onClick={() => setTab("perks")} className={tab === "perks" ? on : off}>Perks</button>
      </nav>
      {tab === "leads" ? <LeadsTab /> : <PerksTab />}
    </div>
  );
}
