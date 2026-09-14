"use client";

import { useState, useTransition } from "react";
import { submitPartnerLead } from "@/app/actions/partners";
import RequiredMark from "@/components/RequiredMark";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";
const labelClass = "block text-sm font-medium text-dark mb-1";

/**
 * Shown by PartnerLoginRequest when a typed email isn't a recognized
 * partner — mirrors MagicLinkRequest's own not_found -> SignupForm
 * fallback, but for interested businesses instead of prospective members.
 * No account is created here; this only reaches partner_leads
 * (db/migrations/024_perks.sql) for Alex to follow up on herself.
 */
export default function PartnerLeadForm({ defaultEmail }: { defaultEmail: string }) {
  const [businessName, setBusinessName] = useState("");
  const [url, setUrl] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitPartnerLead({ businessName, url, firstName, lastName, email, note });
      if (!result.success) {
        setError(result.error ?? "Couldn't submit — try again");
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="text-center">
        <h2 className="text-xl text-dark mb-1" style={{ fontFamily: "var(--font-serif)" }}>
          Thanks — we&apos;ll be in touch
        </h2>
        <p className="text-sm text-muted">
          We reach out to every interested business personally. We&apos;ll follow up at <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            First name <RequiredMark />
          </label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className={inputClass}
            placeholder="Alex"
          />
        </div>
        <div>
          <label className={labelClass}>
            Last name <RequiredMark />
          </label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className={inputClass}
            placeholder="Siega"
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>
          Email <RequiredMark />
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>
          Business name <RequiredMark />
        </label>
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
          className={inputClass}
          placeholder="Postpartum Post"
        />
      </div>
      <div>
        <label className={labelClass}>
          Website <RequiredMark />
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          className={inputClass}
          placeholder="https://"
        />
      </div>
      <div>
        <label className={labelClass}>
          Tell us about your perk idea <RequiredMark />
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          required
          className={inputClass}
          placeholder="A discount, a free class, whatever you have in mind"
        />
      </div>
      {error && <p className="text-xs text-coral">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        data-umami-event="Partners: Submit Lead"
        className="w-full py-2.5 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Submitting…" : "Submit interest"}
      </button>
    </form>
  );
}
