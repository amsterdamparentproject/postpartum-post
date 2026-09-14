"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { createBrowserClient } from "@/lib/supabase";

const TABS = [
  { href: "/partners", label: "Partner profile" },
  { href: "/partners/perks", label: "Your Perks" },
];

/**
 * Mirrors components/AccountTabNav.tsx's tab-bar shape and coral
 * active-tab styling. Simpler than the member version on purpose: no
 * shared cross-page "Save changes" button — partner forms (business info,
 * each location, each perk) save themselves inline, since nothing here
 * spans multiple simultaneously-visible forms the way the profile page's
 * three ProfileForm sections do.
 */
export default function PartnerTabNav() {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
    });
  }

  return (
    <nav className="flex items-center gap-1 border-b border-border mb-8">
      {TABS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              active
                ? "border-coral text-coral"
                : "border-transparent text-muted hover:text-dark"
            }`}
          >
            {label}
          </Link>
        );
      })}
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={handleSignOut}
          disabled={isPending}
          className="px-4 py-2.5 text-sm font-medium text-muted hover:text-dark transition disabled:opacity-50"
        >
          {isPending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </nav>
  );
}
