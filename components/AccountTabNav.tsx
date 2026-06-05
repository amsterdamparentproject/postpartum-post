"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { useProfileSave } from "@/app/(account)/ProfileSaveContext";

const TABS = [
  { href: "/profile", label: "Profile" },
  { href: "/matches", label: "Matches" },
  { href: "/billing", label: "Billing" },
];

export default function AccountTabNav() {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const { triggerSave, saveState, hasSaveHandler } = useProfileSave();

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
      // onAuthStateChange in AccountContext handles the reactive teardown —
      // no router.push/refresh needed, which would re-render with stale state.
    });
  }

  const actionButtons = (
    <>
      {hasSaveHandler && (
        <button
          onClick={triggerSave}
          disabled={saveState.saving || saveState.saved}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition disabled:opacity-60"
        >
          {saveState.saving ? "Saving…" : saveState.saved ? "Saved!" : "Save changes"}
        </button>
      )}
      <button
        onClick={handleSignOut}
        disabled={isPending}
        className="px-4 py-2.5 text-sm font-medium text-muted hover:text-dark transition disabled:opacity-50"
      >
        {isPending ? "Signing out…" : "Sign out"}
      </button>
    </>
  );

  return (
    <>
      {/* Tab bar */}
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

        {/* Desktop: actions inline in the tab bar */}
        <div className="ml-auto hidden md:flex items-center gap-3">
          {actionButtons}
        </div>
      </nav>

      {/* Mobile: actions pinned to the bottom of the screen */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-end gap-3 px-6 py-4 bg-white/90 backdrop-blur border-t border-border">
        {actionButtons}
      </div>
    </>
  );
}
