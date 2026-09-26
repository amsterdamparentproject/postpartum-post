"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { createBrowserClient } from "@/lib/supabase";

const TABS = [
  { href: "/partners/profile", label: "Partner profile" },
  { href: "/partners/perks", label: "Your Perks" },
  { href: "/partners/terms", label: "Partnership terms" },
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

  const signOutButton = (
    <button
      onClick={handleSignOut}
      disabled={isPending}
      className="px-4 py-2.5 text-sm font-medium text-muted hover:text-dark transition disabled:opacity-50"
    >
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );

  // Same mobile shape as AccountTabNav: sign out moves to a bar pinned to
  // the bottom, and the tabs scroll sideways rather than pushing the whole
  // page wider than the screen (three tabs + sign out don't fit at 375px).
  return (
    <>
      <nav className="flex items-center gap-1 border-b border-border mb-8 overflow-x-auto">
        {TABS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`shrink-0 whitespace-nowrap px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                active
                  ? "border-coral text-coral"
                  : "border-transparent text-muted hover:text-dark"
              }`}
            >
              {label}
            </Link>
          );
        })}
        <div className="ml-auto hidden md:flex items-center gap-3">{signOutButton}</div>
      </nav>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-end gap-3 px-6 py-4 bg-white/90 backdrop-blur border-t border-border">
        {signOutButton}
      </div>
    </>
  );
}
