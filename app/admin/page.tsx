import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getBaseStats, getMonthlyRevenue, getMatchRoundStats } from "./stats/actions";

function pct(n: number, total: number) {
  if (total === 0) return 0;
  return Math.round((n / total) * 100);
}
import AdminNav from "./AdminNav";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-1">
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-semibold text-dark">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function RoundRow({ label, count, total, sub }: { label: string; count: number; total: number; sub?: string }) {
  const percent = pct(count, total);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-dark">{label}</span>
        <span className="text-sm font-semibold text-dark">{count} <span className="text-muted font-normal">({percent}%)</span></span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-coral rounded-full" style={{ width: `${percent}%` }} />
      </div>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default async function AdminStatsPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  const secret = process.env.ADMIN_SECRET;
  if (!session || !secret || session.value !== secret) redirect("/admin/login");

  const [base, revenue, round] = await Promise.all([
    getBaseStats(),
    getMonthlyRevenue(),
    getMatchRoundStats(),
  ]);

  const maxRevenue = Math.max(...revenue.map((m) => m.amountCents), 1);
  const monthLabel = new Date(round.month + "-01").toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <main className="min-h-screen bg-[#f0f1f5] px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-8">

        <AdminNav active="stats" />

        {/* Members */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">Members</h2>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Active members"
              value={base.totalActive}
              sub={base.newThisMonth > 0 ? `+${base.newThisMonth} this month` : "No new members this month"}
            />
            <StatCard
              label="Growth this month"
              value={base.momPercent !== null ? `+${base.momPercent}%` : "—"}
              sub={base.momPercent !== null ? `${base.newThisMonth} new member${base.newThisMonth === 1 ? "" : "s"}` : undefined}
            />
            <StatCard
              label="Revenue this month"
              value={`€${((revenue.at(-1)?.amountCents ?? 0) / 100).toFixed(0)}`}
            />
          </div>
        </section>

        {/* Plans */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">Plans</h2>
          <div className="flex gap-3 flex-wrap">
            {base.planBreakdown.map((plan) => (
              <StatCard key={plan.label} label={plan.label} value={plan.count} />
            ))}
          </div>
        </section>

        {/* Revenue chart */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">Monthly Revenue (last 12 months)</h2>
          <div className="bg-white rounded-xl border border-border p-5">
            <div className="flex items-end gap-2 h-32">
              {revenue.map((m) => {
                const heightPct = Math.round((m.amountCents / maxRevenue) * 100);
                const euros = (m.amountCents / 100).toFixed(0);
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      €{euros}
                    </span>
                    <div className="w-full flex items-end" style={{ height: "88px" }}>
                      <div
                        className="w-full bg-coral/80 rounded-t hover:bg-coral transition-colors"
                        style={{ height: `${Math.max(heightPct, m.amountCents > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Match round */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">Match Round — {monthLabel}</h2>
          <div className="bg-white rounded-xl border border-border p-5 space-y-4">
            <RoundRow
              label="Opted in"
              count={round.optedIn}
              total={round.totalActive}
              sub={`${round.coffee} coffee · ${round.playdate} playdate`}
            />
            <RoundRow label="Skipped" count={round.skipped} total={round.totalActive} />
            <RoundRow label="No response" count={round.noResponse} total={round.totalActive} />
          </div>
        </section>

      </div>
    </main>
  );
}
