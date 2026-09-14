"use client";

import { useState, useTransition } from "react";
import {
  upsertPartnerLocation,
  deletePartnerLocation,
  type PartnerLocation,
} from "@/app/actions/partners";
import RequiredMark from "@/components/RequiredMark";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition text-sm";

type DraftLocation = PartnerLocation | { id: undefined; label: string; address: string; area: null; neighborhood: null };

function LocationRow({
  location,
  accessToken,
  onSaved,
  onDeleted,
  onCancelNew,
}: {
  location: DraftLocation;
  accessToken: string;
  onSaved: (loc: PartnerLocation) => void;
  onDeleted: (id: string) => void;
  onCancelNew: () => void;
}) {
  const [label, setLabel] = useState(location.label ?? "");
  const [address, setAddress] = useState(location.address ?? "");
  const [editing, setEditing] = useState(!location.id);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await upsertPartnerLocation(accessToken, { id: location.id, label, address });
      if (!result.success || !result.location) {
        setError(result.error ?? "Couldn't save — try again");
        return;
      }
      onSaved(result.location);
      setEditing(false);
    });
  }

  function handleDelete() {
    if (!location.id) return;
    startTransition(async () => {
      const result = await deletePartnerLocation(accessToken, location.id!);
      if (result.success) onDeleted(location.id!);
    });
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
        <div>
          {location.label && <p className="text-sm font-medium text-dark">{location.label}</p>}
          <p className="text-sm text-muted">{location.address}</p>
          {location.area && (
            <p className="text-xs text-muted mt-0.5">{location.area}{location.neighborhood ? ` · ${location.neighborhood}` : ""}</p>
          )}
        </div>
        <div className="flex gap-3 shrink-0">
          <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-coral transition">Edit</button>
          <button onClick={handleDelete} disabled={isPending} className="text-xs text-muted hover:text-coral transition">
            {isPending ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3 border-b border-border last:border-0 space-y-2">
      <div>
        <label className="block text-xs font-medium text-dark mb-1">Label</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Optional — e.g. Center studio"
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-dark mb-1">
          Address <RequiredMark />
        </label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          className={inputClass}
        />
      </div>
      {error && <p className="text-xs text-coral">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={isPending || !address.trim()}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save location"}
        </button>
        {location.id ? (
          <button onClick={() => setEditing(false)} className="text-sm text-muted hover:text-dark transition">Cancel</button>
        ) : (
          <button onClick={onCancelNew} className="text-sm text-muted hover:text-dark transition">Cancel</button>
        )}
      </div>
    </div>
  );
}

/**
 * A partner can operate from more than one physical location (Life in
 * Bloom Yoga: Center + West studios) — see partner_locations in
 * db/migrations/023_perks.sql. Each perk later points at one of these via
 * a nullable location_id. area/neighborhood are geocoded server-side on
 * save (lib/geocode.ts) and shown read-only here — no manual override in
 * this first pass.
 */
export default function PartnerLocationsManager({
  locations: initialLocations,
  accessToken,
}: {
  locations: PartnerLocation[];
  accessToken: string;
}) {
  const [locations, setLocations] = useState(initialLocations);
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-dark">Locations</h2>
        {!addingNew && (
          <button
            onClick={() => setAddingNew(true)}
            className="text-sm font-semibold text-coral hover:text-coral-dark transition"
          >
            + Add location
          </button>
        )}
      </div>
      {locations.length === 0 && !addingNew && (
        <p className="text-sm text-muted">No locations yet — add one if you operate from a physical address.</p>
      )}
      <div>
        {locations.map((loc) => (
          <LocationRow
            key={loc.id}
            location={loc}
            accessToken={accessToken}
            onSaved={(updated) => setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))}
            onDeleted={(id) => setLocations((prev) => prev.filter((l) => l.id !== id))}
            onCancelNew={() => {}}
          />
        ))}
        {addingNew && (
          <LocationRow
            location={{ id: undefined, label: "", address: "", area: null, neighborhood: null }}
            accessToken={accessToken}
            onSaved={(created) => {
              setLocations((prev) => [...prev, created]);
              setAddingNew(false);
            }}
            onDeleted={() => {}}
            onCancelNew={() => setAddingNew(false)}
          />
        )}
      </div>
    </div>
  );
}
