"use client";

import { useEffect, useState } from "react";
import {
  listPartnerPerks,
  listPerkCategories,
  type PartnerPerk,
  type PerkCategory,
} from "@/app/actions/partners";
import type { PartnerLocation } from "@/app/actions/partners";
import PartnerPerkForm from "@/components/PartnerPerkForm";

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
 * The "Your Perks" tab — mirrors the /matches list-of-cards shape Alex
 * asked for. A perk is always partner-authored here (source:
 * 'partner_portal', forced server-side in savePartnerPerk), and always
 * starts — or returns to — 'pending' until Alex reviews it in
 * /admin/perks.
 */
export default function PartnerPerksManager({
  accessToken,
  locations,
}: {
  accessToken: string;
  locations: PartnerLocation[];
}) {
  const [perks, setPerks] = useState<PartnerPerk[] | null>(null);
  const [categories, setCategories] = useState<PerkCategory[]>([]);
  const [editing, setEditing] = useState<PartnerPerk | null | "new">(null);

  // .then()-chained, same shape as MagicLinkRequest's getSignupMeta() fetch
  // — a plain useEffect-called async function whose body calls setState
  // directly trips the set-state-in-effect lint rule; this doesn't.
  function fetchPerksAndCategories() {
    return Promise.all([listPartnerPerks(accessToken), listPerkCategories()]);
  }

  function reload() {
    fetchPerksAndCategories().then(([perkList, categoryList]) => {
      setPerks(perkList);
      setCategories(categoryList);
    });
  }

  useEffect(() => {
    fetchPerksAndCategories().then(([perkList, categoryList]) => {
      setPerks(perkList);
      setCategories(categoryList);
      // Nothing to show yet — skip straight to the form instead of an
      // empty list + a button the partner has to notice and click first.
      if (perkList.length === 0) setEditing("new");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  if (editing !== null) {
    return (
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
        <PartnerPerkForm
          perk={editing === "new" ? null : editing}
          locations={locations}
          categories={categories}
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

      <div className="space-y-3">
        {perks?.map((perk) => (
          <button
            key={perk.id}
            onClick={() => setEditing(perk)}
            className="w-full text-left bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 hover:border-coral/40 transition"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-dark">{perk.perk_title}</p>
                <p className="text-sm text-muted mt-0.5">{perk.perk_discount}</p>
              </div>
              <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLES[perk.status]}`}>
                {STATUS_LABELS[perk.status]}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
