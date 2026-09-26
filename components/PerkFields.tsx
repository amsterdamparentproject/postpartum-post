"use client";

import type { ReactNode } from "react";
import RequiredMark from "@/components/RequiredMark";
import ExclusiveToggle from "@/components/ExclusiveToggle";
import {
  PERK_DESCRIPTION_MAX,
  PERK_TITLE_MAX,
  REDEMPTION_TYPES,
  REDEMPTION_TYPE_LABELS,
  type PerkInput,
} from "@/lib/perk-input";

type LocationOption = { id: string; label: string | null; address: string };

const DEFAULT_INPUT_CLASS =
  "w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition";
const DEFAULT_LABEL_CLASS = "block text-sm font-medium text-dark mb-1";

/**
 * The one perk field set, used by PartnerPerkForm (partner portal) and
 * AdminPerkForm / EditPerkForm (/admin/partners). Controlled: the caller
 * owns the PerkInput and the submit; this only renders and edits it.
 * Validation mirrors normalizePerkInput (lib/perk-input.ts), which every
 * save action runs again server-side.
 *
 * Location always shows and is optional. Callers preselect a partner's only
 * location on a new perk (defaultLocationId); "No specific location" means
 * it isn't tied to one place (see resolvePerkLocation in lib/perk-save.ts).
 */
export default function PerkFields({
  value,
  onChange,
  locations,
  photo,
  inputClass = DEFAULT_INPUT_CLASS,
  labelClass = DEFAULT_LABEL_CLASS,
}: {
  value: PerkInput;
  onChange: (next: PerkInput) => void;
  locations: LocationOption[];
  /** The partner photo upload (PhotoUpload), placed after how it's redeemed. */
  photo?: ReactNode;
  inputClass?: string;
  labelClass?: string;
}) {
  function set<K extends keyof PerkInput>(key: K, v: PerkInput[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between">
          <label className={labelClass}>
            Headline <RequiredMark />
          </label>
          <CharCount length={value.title.length} max={PERK_TITLE_MAX} />
        </div>
        <input
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          required
          maxLength={PERK_TITLE_MAX}
          className={inputClass}
          placeholder="20% off your first class"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className={labelClass}>
            Description <RequiredMark />
          </label>
          <CharCount length={value.description.length} max={PERK_DESCRIPTION_MAX} />
        </div>
        <textarea
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          required
          rows={2}
          maxLength={PERK_DESCRIPTION_MAX}
          className={inputClass}
          placeholder="One sentence, e.g. Valid on any weekday class. Show this at the front desk."
        />
      </div>

      <div>
        <label className={labelClass}>
          Link {value.redemption_type === "online" && <RequiredMark />}
        </label>
        <input
          type="url"
          value={value.url}
          onChange={(e) => set("url", e.target.value)}
          required={value.redemption_type === "online"}
          className={inputClass}
          placeholder="https://"
        />
        <p className="text-xs text-muted mt-1">
          Where members redeem it or learn more. Starts as your website; change it if the perk has its own page.
        </p>
      </div>

      <div>
        <label className={labelClass}>
          How members redeem it <RequiredMark />
        </label>
        <div className="flex flex-wrap gap-2">
          {REDEMPTION_TYPES.map((type) => {
            const active = value.redemption_type === type;
            return (
              <button
                type="button"
                key={type}
                onClick={() => set("redemption_type", type)}
                aria-pressed={active}
                className={`px-3 py-1.5 text-sm rounded-full border transition ${
                  active ? "bg-coral text-white border-coral" : "border-border text-muted hover:text-dark"
                }`}
              >
                {REDEMPTION_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
        <div className="mt-2">
          {value.redemption_type === "code" && (
            <input
              value={value.redemption_code}
              onChange={(e) => set("redemption_code", e.target.value)}
              required
              className={inputClass}
              placeholder="The code, e.g. POSTPARTUMPOST20"
              aria-label="Code"
            />
          )}
          {value.redemption_type === "in_person" && (
            <p className="text-xs text-muted">
              Say how in the description, e.g. &quot;Show this at the counter.&quot;
            </p>
          )}
          {value.redemption_type === "online" && (
            <p className="text-xs text-muted">
              Members follow the link above and the discount applies there, no code needed.
            </p>
          )}
        </div>
      </div>

      {photo}

      {/* items-end: the two hint lines can wrap differently, so align the inputs, not the labels. */}
      <div className="grid sm:grid-cols-2 gap-4 items-end">
        {/* min-w-0: grid items default to their content's width, so a long
            location name would otherwise push the form wider than the screen. */}
        <div className="min-w-0">
          <label className={labelClass}>Location</label>
          <p className="text-xs text-muted mb-1.5">
            Perks with locations will show up on the match map! Add them in the profile tab.
          </p>
          <select
            value={value.location_id ?? ""}
            onChange={(e) => set("location_id", e.target.value || null)}
            className={inputClass}
          >
            <option value="">{locations.length === 0 ? "No locations yet" : "No specific location"}</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.label || loc.address}</option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className={labelClass}>Expires</label>
          <p className="text-xs text-muted mb-1.5">Leave empty if the perk doesn&apos;t expire.</p>
          <input
            type="date"
            value={value.expires_at}
            onChange={(e) => set("expires_at", e.target.value)}
            // iOS Safari gives date inputs a fixed intrinsic width that ignores
            // w-full, and collapses them when empty without a min height.
            className={`${inputClass} min-w-0 appearance-none min-h-[2.75rem]`}
          />
        </div>
      </div>

      <ExclusiveToggle checked={value.exclusive} onChange={(v) => set("exclusive", v)} />
    </div>
  );
}

function CharCount({ length, max }: { length: number; max: number }) {
  return (
    <span className={`text-xs ${length >= max ? "text-coral" : "text-muted"}`}>
      {length}/{max}
    </span>
  );
}
