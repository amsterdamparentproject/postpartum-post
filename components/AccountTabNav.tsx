"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/profile", label: "Profile" },
  { href: "/billing", label: "Billing" },
  { href: "/matches", label: "Matches" },
];

export default function AccountTabNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-border mb-8">
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
    </nav>
  );
}
