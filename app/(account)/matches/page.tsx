"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
      {status?.type === "matched" && (
        <MatchedCard matchId={status.matchId} topic={status.topic} matchFirstName={status.matchFirstName} />
      )}
      {status?.type === "pending" && <PendingCard topic={status.topic} />}
      {status?.type === "none" && <EmptyCard />}
    </div>
  );
}

function MatchedCard({
  matchId,
  topic,
  matchFirstName,
}: {
  matchId: string;
  topic: "coffee" | "playdate";
  matchFirstName: string;
}) {
  const monthYear = new Date().toLocaleString("en-NL", { month: "long", year: "numeric" });

  return (
    <Link href={`/matches/${matchId}`} className="block">
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 space-y-2 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{topic === "coffee" ? "☕" : "🛝"}</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-dark text-sm">
                {topic === "coffee"
                  ? `Coffee with ${matchFirstName}`
                  : `Playdate with ${matchFirstName}`}
              </p>
              {/* <span className="text-xs text-muted bg-gray-100 rounded-full px-2.5 py-0.5">
                {monthYear}
              </span> */}
            </div>
            <p className="text-xs text-muted mt-0.5">{monthYear}</p>
          </div>
          <span className="ml-auto text-xs text-green-700 bg-green-50 rounded-full px-2.5 py-1 shrink-0">
            Matched
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyCard() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">✉️</span>
        <p className="text-sm text-muted">
          Your first match will appear here soon! Check your email around the 1st of the month to get matched.
        </p>
      </div>
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
