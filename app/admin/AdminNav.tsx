import EnvelopeLogo from "@/components/EnvelopeLogo";
import Link from "next/link";

export default function AdminNav({ active }: { active: "stats" | "matches" | "demographics" | "partners" }) {
  const base = "text-sm font-medium px-3 py-1.5 rounded-lg transition-colors";
  const on = `${base} bg-dark text-white`;
  const off = `${base} text-muted hover:text-dark`;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <EnvelopeLogo className="w-8 h-auto" />
        <span className="text-lg font-semibold text-coral" style={{ fontFamily: "var(--font-serif)" }}>PostAdmin</span>
      </div>
      <nav className="flex gap-1">
        <Link href="/admin" className={active === "stats" ? on : off}>Stats</Link>
        <Link href="/admin/matches" className={active === "matches" ? on : off}>Matches</Link>
        <Link href="/admin/demographics" className={active === "demographics" ? on : off}>Demographics</Link>
        <Link href="/admin/partners" className={active === "partners" ? on : off}>Partners</Link>
      </nav>
    </div>
  );
}
