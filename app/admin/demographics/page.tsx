import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDemographicStats } from "@/app/admin/stats/actions";
import AdminNav from "@/app/admin/AdminNav";
import MemberMapClient from "@/components/MemberMapClient";

function BarChart({ buckets }: { buckets: { label: string; count: number; expected?: true }[] }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className="flex items-end gap-2" style={{ height: "120px" }}>
      {buckets.map((bucket) => {
        const heightPct = Math.round((bucket.count / max) * 100);
        return (
          <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1 group">
            <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100 transition-opacity">
              {bucket.count}
            </span>
            <div className="w-full flex items-end" style={{ height: "88px" }}>
              <div
                className="w-full rounded-t hover:opacity-80 transition-opacity"
                style={{
                  height: `${Math.max(heightPct, bucket.count > 0 ? 4 : 0)}%`,
                  background: bucket.expected ? "#B0C4D8" : "#E8745A",
                }}
              />
            </div>
            <span className="text-[10px] text-muted text-center leading-tight">{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default async function DemographicsPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  const secret = process.env.ADMIN_SECRET;
  if (!session || !secret || session.value !== secret) redirect("/admin/login");

  const { locations, ageBuckets, availabilityDays, parentTypes } = await getDemographicStats();
  const totalChildren = ageBuckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <main className="min-h-screen bg-[#f0f1f5] px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-8">

        <AdminNav active="demographics" />

        {/* Map */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">
            Member Locations — {locations.length} active member{locations.length === 1 ? "" : "s"} with location data
          </h2>
          <div className="bg-white rounded-xl border border-border p-3">
            <MemberMapClient locations={locations} />
          </div>
        </section>

        {/* Availability + Parent type */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">Availability &amp; Preferences</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-border p-5">
              <BarChart buckets={availabilityDays} />
            </div>
            <div className="bg-white rounded-xl border border-border p-5">
              <BarChart buckets={parentTypes} />
            </div>
          </div>
        </section>

        {/* Age distribution */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">
            Child Age Distribution — {totalChildren} child{totalChildren === 1 ? "" : "ren"} across active members
          </h2>
          <div className="bg-white rounded-xl border border-border p-5 space-y-4">
            <BarChart buckets={ageBuckets} />
            {ageBuckets.some((b) => b.expected) && (
              <div className="flex items-center gap-4 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#E8745A" }} />
                  Born
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#B0C4D8" }} />
                  Expected
                </span>
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
