"use client";

import { useEffect, useState } from "react";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import { useAccount } from "@/app/(account)/AccountContext";
import { getMatchStatus, type MatchStatus } from "./actions";

export default function MatchesPage() {
  const { loading, member } = useAccount();
  const [status, setStatus] = useState<MatchStatus | null>(null);

  useEffect(() => {
    if (member) {
      getMatchStatus(member.id).then(setStatus);
    }
  }, [member]);

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest />;

  return (
    <div className="space-y-4">
      {status?.type === "pending" && <PendingCard topic={status.topic} />}
      {status?.type === "none" && (
        <p className="text-muted text-sm">Your matches will appear here.</p>
      )}
    </div>
  );
}

function PendingCard({ topic }: { topic: "coffee" | "playdate" }) {
  const monthYear = new Date().toLocaleString("en-NL", { month: "long", year: "numeric" });

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{topic === "coffee" ? "☕" : "🛝"}</span>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-dark text-sm">
              {topic === "coffee" ? "Coffee match" : "Playdate match"}
            </p>
            <span className="text-xs text-muted bg-gray-100 rounded-full px-2.5 py-0.5">
              {monthYear}
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            We're arranging your introduction. You'll hear from us on the 7th.
          </p>
        </div>
        <span className="ml-auto text-xs text-muted bg-gray-100 rounded-full px-2.5 py-1 shrink-0">
          Pending
        </span>
      </div>
    </div>
  );
}
