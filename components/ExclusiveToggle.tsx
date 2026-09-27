"use client";

import { useState } from "react";
import Link from "next/link";
import Sparkle from "@/components/Sparkle";

// The Post Perks wordmark green (PostPerksWordMark).
const PERK_GREEN = "#8A9E3A";

/**
 * The "Exclusive to Postpartum Post" choice on the perk forms (PerkFields),
 * as a selectable box instead of a plain checkbox. Carries the Post Perks
 * visual language: the sparkle (grayed out when off, full color and a
 * one-time .wiggle when switched on) and the wordmark green for the
 * selected state. Still a real checkbox underneath, so keyboard and
 * screen readers work as before.
 */
export default function ExclusiveToggle({
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
      className={`flex items-center gap-4 rounded-xl border-2 my-6 px-4 py-3 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[#8A9E3A]/40 ${
        checked ? "border-[#8A9E3A] bg-green/30" : "border-border bg-white hover:border-[#8A9E3A]/50"
      }`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => toggle(e.target.checked)}
      />
      <Sparkle
        className={`w-10 h-auto shrink-0 transition ${checked ? "" : "grayscale opacity-40"}${wiggling ? " wiggle" : ""}`}
      />
      <span className="flex-1 min-w-0 text-sm leading-relaxed">
        <span
          className="block text-base"
          style={{ fontFamily: "var(--font-serif)", color: checked ? PERK_GREEN : undefined }}
        >
          Exclusive to Postpartum Post
        </span>
        <span className="text-muted">
          Your perk gets an exclusive badge and extra promotion.{" "}
          <Link
            href="/partners/terms#exclusivity"
            target="_blank"
            onClick={(e) => e.stopPropagation()}
            className="text-coral hover:underline underline-offset-2"
          >
            See terms
          </Link>
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
