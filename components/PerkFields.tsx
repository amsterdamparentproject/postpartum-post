"use client";

import type { ReactNode } from "react";
import RequiredMark from "@/components/RequiredMark";
import ExclusiveToggle from "@/components/ExclusiveToggle";
import IntroOfferToggle from "@/components/IntroOfferToggle";
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
 * Locations always show and are optional, multi-select (any number of the
 * partner's own locations -- db/migrations/031_perk_multi_location.sql).
 * Callers preselect a partner's only location on a new perk
 * (defaultLocationIds); none checked means it isn't tied to one place (see
 * resolvePerkLocations in lib/perk-save.ts). "Online" is a separate,
 * partner-agnostic checkbox (is_online) for a perk that's online
 * everywhere, with no address to give it -- independent of, and
 * combinable with, the location checkboxes.
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
          aria-label="Headline"
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
          aria-label="Description"
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
          aria-label="Link"
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
          <label className={labelClass}>Locations</label>
          <p className="text-xs text-muted mb-1.5">
            Perks with locations will show up on the match map! Add them in the profile tab.
            Check any that apply, plus Online if it works that way too.
          </p>
          <div className={`space-y-2 rounded-lg border border-border bg-white px-4 py-3`}>
            <label className="flex items-center gap-2 text-sm text-dark cursor-pointer">
              <input
                type="checkbox"
                checked={value.is_online}
                onChange={(e) => set("is_online", e.target.checked)}
                className="rounded border-border text-coral focus:ring-2 focus:ring-coral/40"
              />
              Online
            </label>
            {locations.length === 0 ? (
              <p className="text-xs text-muted">No locations yet — add them in the profile tab.</p>
            ) : (
              locations.map((loc) => {
                const checked = value.location_ids.includes(loc.id);
                return (
                  <label key={loc.id} className="flex items-center gap-2 text-sm text-dark cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        set(
                          "location_ids",
                          e.target.checked
                            ? [...value.location_ids, loc.id]
                            : value.location_ids.filter((id) => id !== loc.id),
                        )
                      }
                      className="rounded border-border text-coral focus:ring-2 focus:ring-coral/40"
                    />
                    {loc.label || loc.address}
                  </label>
                );
              })
            )}
          </div>
        </div>
        <div className="min-w-0">
          <label className={labelClass}>Expires</label>
          <p className="text-xs text-muted mb-1.5">Leave empty if the perk doesn&apos;t expire.</p>
          <input
            type="date"
            value={value.expires_at}
            aria-label="Expires"
            onChange={(e) => set("expires_at", e.target.value)}
            // iOS Safari gives date inputs a fixed intrinsic width that ignores
            // w-full, and collapses them when empty without a min height.
            className={`${inputClass} min-w-0 appearance-none min-h-[2.75rem]`}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="estimated-savings">Estimated savings (€)</label>
        <p className="text-xs text-muted mb-1.5">
          Roughly how many euros this saves a member, in whole euros. It shows as &quot;Save €X&quot; on the card. Leave empty if there&apos;s no clean figure.
        </p>
        <input
          id="estimated-savings"
          type="text"
          inputMode="numeric"
          value={value.estimated_savings}
          onChange={(e) => set("estimated_savings", e.target.value.replace(/[^\d]/g, ""))}
          className={`${inputClass} max-w-[10rem]`}
        />
      </div>

      <div className="space-y-3 my-6">
        <ExclusiveToggle checked={value.exclusive} onChange={(v) => set("exclusive", v)} />
        <IntroOfferToggle
          checked={value.frequency === "once"}
          onChange={(v) => set("frequency", v ? "once" : "monthly")}
        />
      </div>
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
