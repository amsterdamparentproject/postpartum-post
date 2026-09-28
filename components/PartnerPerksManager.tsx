"use client";

import { useEffect, useState } from "react";
import {
  listPartnerPerks,
  type PartnerPerk,
  type PartnerProfile,
} from "@/app/actions/partners";
import PartnerPerkForm from "@/components/PartnerPerkForm";
import PerkCard from "@/components/PerkCard";
import { perkLocationLabel } from "@/lib/perk-display";

const STATUS_STYLES: Record<PartnerPerk["status"], string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  coming_soon: "bg-blue-50 text-blue-700 border-blue-200",
  published: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-coral/10 text-coral border-coral/30",
  archived: "bg-gray-100 text-muted border-border",
};

const STATUS_LABELS: Record<PartnerPerk["status"], string> = {
  pending: "In review",
  coming_soon: "Coming soon",
  published: "Live",
  rejected: "Not approved",
  archived: "Archived",
};

/**
 * The "Your Perks" tab — each perk shown as the same PerkCard members will
 * see, with its review status on top, so partners get a live preview while
 * a perk is still in review. Clicking a card opens it for editing. A perk is always partner-authored here (source:
 * 'partner_portal', forced server-side in savePartnerPerk), and always
 * starts — or returns to — 'pending' until Alex reviews it in
 * /admin/perks.
 */
export default function PartnerPerksManager({
  accessToken,
  partner,
  onPartnerChange,
}: {
  accessToken: string;
  partner: PartnerProfile;
  onPartnerChange: () => void; // refetch the partner, e.g. after a photo change
}) {
  const { locations } = partner;
  const [perks, setPerks] = useState<PartnerPerk[] | null>(null);
  const [editing, setEditing] = useState<PartnerPerk | null | "new">(null);

  function reload() {
    listPartnerPerks(accessToken).then(setPerks);
  }

  useEffect(() => {
    // .then()-chained so setState never runs synchronously in the effect body
    // (the set-state-in-effect lint rule).
    listPartnerPerks(accessToken).then((perkList) => {
      setPerks(perkList);
      // Nothing to show yet — skip straight to the form instead of an
      // empty list + a button the partner has to notice and click first.
      if (perkList.length === 0) setEditing("new");
    });
  }, [accessToken]);

  if (editing !== null) {
    return (
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-5 sm:p-8">
        <PartnerPerkForm
          perk={editing === "new" ? null : editing}
          locations={locations}
          website={partner.url}
          imageUrl={partner.image_url}
          onImageChange={onPartnerChange}
          accessToken={accessToken}
          onSaved={() => { setEditing(null); reload(); }}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          Your Perks
        </h2>
        <button
          onClick={() => setEditing("new")}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition"
        >
          + Add new perk
        </button>
      </div>

      {perks === null && <p className="text-sm text-muted">Loading…</p>}
      {perks?.length === 0 && (
        <p className="text-sm text-muted">
          No perks yet. Add one for members to discover once it&apos;s approved.
        </p>
      )}

      {perks && perks.length > 0 && (
        <p className="text-sm text-muted">
          This is how members will see your perks. Only <span className="font-medium text-dark">Live</span> perks
          are visible to them. Tap a perk to edit it.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {perks?.map((perk) => {
          const perkLocations = locations.filter((l) => perk.location_ids.includes(l.id));
          return (
            <PerkCard
              key={perk.id}
              perk={perk}
              partner={partner}
              locationLabel={perkLocationLabel(perkLocations, perk.is_online)}
              onClick={() => setEditing(perk)}
              actionLabel="Edit perk"
              badge={
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border shadow-sm ${STATUS_STYLES[perk.status]}`}>
                  {STATUS_LABELS[perk.status]}
                </span>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
