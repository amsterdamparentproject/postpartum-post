"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";

const NAV_LINKS = [
  { href: "/about", label: "About" },
];

interface HeaderProps {
  showNav?: boolean;
  activeRoute?: string;
}

export default function Header({ showNav = false, activeRoute }: HeaderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
      <Link href="/" className="flex items-center gap-3">
        <Image src="/logo.png" alt="Postpartum Post" width={40} height={40} />
        <span className="text-xl font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
          <span className="text-coral">Postpartum</span>{" "}
          <span className="text-dark">Post</span>
        </span>
      </Link>

      {showNav && (
        <nav className="flex gap-6 text-sm font-medium text-muted">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={activeRoute === href ? "text-dark font-semibold" : "hover:text-dark transition"}
            >
              {label}
            </Link>
          ))}
          {isAuthenticated && (
            <Link
              href="/profile"
              className={activeRoute === "/profile" ? "text-dark font-semibold" : "hover:text-dark transition"}
            >
              Profile
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
