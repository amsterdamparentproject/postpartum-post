"use client";

import { useState } from "react";

const PERK_GREEN = "#8A9E3A";

/**
 * The "Intro offer" choice on the perk forms (PerkFields) -- same selectable-box
 * pattern as ExclusiveToggle, so the two sit consistently in the form, but with
 * its own copy and no sparkle (that's reserved for Exclusive). Checked = the
 * perk's `frequency` is 'once' instead of the default 'monthly': a member can
 * redeem it a single time, ever, rather than every month. Enforcement is in
 * db/migrations/028_perk_intro_offers.sql -- this toggle only sets the flag.
 */
export default function IntroOfferToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const [wiggling, setWiggling] = useState(false);

  function toggle(next: boolean) {
    onChange(next);
    if (next) {
      setWiggling(true);
      setTimeout(() => setWiggling(false), 550);
    }
  }

  return (
    <label
      className={`flex items-center gap-4 rounded-xl border-2 px-4 py-3 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[#8A9E3A]/40 ${
        checked ? "border-[#8A9E3A] bg-green/30" : "border-border bg-white hover:border-[#8A9E3A]/50"
      }`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => toggle(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg transition ${
          checked ? "" : "grayscale opacity-40"
        }${wiggling ? " wiggle" : ""}`}
        style={{ backgroundColor: checked ? `${PERK_GREEN}1a` : undefined }}
      >
        🎉
      </span>
      <span className="flex-1 min-w-0 text-sm leading-relaxed">
        <span
          className="block text-base"
          style={{ fontFamily: "var(--font-serif)", color: checked ? PERK_GREEN : undefined }}
        >
          Intro offer
        </span>
        <span className="text-muted">
          For first-timers only -- each member can redeem it once, ever, instead of every month.
        </span>
      </span>
      <span
        aria-hidden="true"
        className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
          checked ? "border-[#8A9E3A] bg-[#8A9E3A] text-white" : "border-border bg-white"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </label>
  );
}
