import Link from "next/link";

export default function AdminNav({ active }: { active: "stats" | "matches" }) {
  const base = "text-sm font-medium px-3 py-1.5 rounded-lg transition-colors";
  const on = `${base} bg-dark text-white`;
  const off = `${base} text-muted hover:text-dark`;

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-dark">PostStats</span>
      <nav className="flex gap-1">
        <Link href="/admin" className={active === "stats" ? on : off}>Stats</Link>
        <Link href="/admin/matches" className={active === "matches" ? on : off}>Matches</Link>
      </nav>
    </div>
  );
}
