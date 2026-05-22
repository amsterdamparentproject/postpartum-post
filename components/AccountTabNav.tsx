"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { createBrowserClient } from "@/lib/supabase";

const TABS = [
  { href: "/profile", label: "Profile" },
  { href: "/billing", label: "Billing" },
  { href: "/matches", label: "Matches" },
];

export default function AccountTabNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
      router.push("/profile");
      router.refresh();
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
      <button
        onClick={handleSignOut}
        disabled={isPending}
        className="ml-auto px-4 py-2.5 text-sm font-medium text-muted hover:text-dark transition disabled:opacity-50"
      >
        {isPending ? "Signing out…" : "Sign out"}
      </button>
    </nav>
  );
}
