import Image from "next/image";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/profile", label: "Your Post" },
];

interface HeaderProps {
  showNav?: boolean;
  activeRoute?: string;
}

export default function Header({ showNav = true, activeRoute }: HeaderProps) {
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
        </nav>
      )}
    </header>
  );
}
