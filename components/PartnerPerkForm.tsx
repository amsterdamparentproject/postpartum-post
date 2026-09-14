"use client";

import { useState, useTransition } from "react";
import { savePartnerPerk, type PartnerPerk, type PerkCategory } from "@/app/actions/partners";
import type { PartnerLocation } from "@/app/actions/partners";

const inputClass =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";
const labelClass = "block text-sm font-medium text-dark mb-1";

/**
 * Create/edit form for a single perk. Always submits through
 * savePartnerPerk, which forces source: 'partner_portal' and status:
 * 'pending' server-side — a partner can never publish directly, and
 * editing a live perk sends it back to Alex's review queue (intentional,
 * see that action's docblock).
 */
export default function PartnerPerkForm({
  perk,
  locations,
  categories,
  accessToken,
  onSaved,
  onCancel,
}: {
  perk: PartnerPerk | null; // null = creating a new perk
  locations: PartnerLocation[];
  categories: PerkCategory[];
  accessToken: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [locationId, setLocationId] = useState(perk?.location_id ?? "");
  const [partnerLink, setPartnerLink] = useState(perk?.partner_link ?? "");
  const [title, setTitle] = useState(perk?.perk_title ?? "");
  const [description, setDescription] = useState(perk?.perk_description ?? "");
  const [discount, setDiscount] = useState(perk?.perk_discount ?? "");
  const [instructions, setInstructions] = useState(perk?.redemption_instructions ?? "");
  const [code, setCode] = useState(perk?.perk_redemption_code ?? "");
  const [redemptionUrl, setRedemptionUrl] = useState(perk?.perk_redemption_url ?? "");
  const [expiresAt, setExpiresAt] = useState(perk?.expires_at ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(perk?.category_ids ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleCategory(id: string) {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await savePartnerPerk(accessToken, {
        id: perk?.id,
        location_id: locationId || null,
        partner_link: partnerLink,
        perk_title: title,
        perk_description: description,
        perk_discount: discount,
        redemption_instructions: instructions,
        perk_redemption_code: code,
        perk_redemption_url: redemptionUrl,
        expires_at: expiresAt,
        category_ids: categoryIds,
      });
      if (!result.success) {
        setError(result.error ?? "Couldn't save — try again");
        return;
      }
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
        {perk ? "Edit perk" : "Add new perk"}
      </h2>

      <div>
        <label className={labelClass}>Perk title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputClass} placeholder="20% off your first class" />
      </div>

      <div>
        <label className={labelClass}>Discount</label>
        <input value={discount} onChange={(e) => setDiscount(e.target.value)} required className={inputClass} placeholder="20% off, 1 free class, €10 off…" />
      </div>

      <div>
        <label className={labelClass}>Description</label>
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

      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Perk-specific link</label>
          <input value={partnerLink} onChange={(e) => setPartnerLink(e.target.value)} className={inputClass} placeholder="If different from your website" />
        </div>
        <div>
          <label className={labelClass}>Expires</label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
        </div>
      </div>

      {error && <p className="text-xs text-coral">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60"
        >
          {isPending ? "Saving…" : perk ? "Save changes" : "Submit for review"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-dark transition">
          Cancel
        </button>
      </div>
    </form>
  );
}
