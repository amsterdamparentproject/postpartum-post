"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import WordMark from "@/components/WordMark";
import EnvelopeLogo from "@/components/EnvelopeLogo";

const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/partners", label: "Partners" },
  // "Your Post" covers the whole (account) route group, not just /profile —
  // those routes share a URL prefix only through the group's folder name,
  // which Next.js drops from the actual path, so each one is listed here.
  { href: "/profile", label: "Your Post", activeOn: ["/profile", "/matches", "/billing", "/feedback"] },
];

interface HeaderProps {
  showNav?: boolean;
}

/** True when `pathname` is `path` itself or a route nested under it. */
function isActivePath(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function Header({ showNav = true }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="px-6 py-5 flex items-center justify-between max-w-5xl mx-auto w-full">
      <Link href="/" className="flex items-center gap-3">
        <EnvelopeLogo width={40} height={29} />
        <WordMark size="text-xl" className="hidden sm:inline" />
      </Link>

      {showNav && (
        <nav className="flex gap-4 sm:gap-6 text-sm font-medium text-muted">
          {NAV_LINKS.map(({ href, label, activeOn }) => {
            const active = (activeOn ?? [href]).some((path) => isActivePath(pathname, path));
            return (
              <Link
                key={href}
                href={href}
                className={active ? "text-dark font-semibold" : "hover:text-dark transition"}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
