"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import { useAccount } from "@/app/(account)/AccountContext";
import { getMatchStatus, type MatchStatus, type MatchEntry } from "./actions";

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

  const pastMatches = status?.pastMatches ?? [];

  return (
    <div className="space-y-4">
      {status?.type === "matched" && status.matches.map((m) => (
        <MatchedCard key={m.matchId} match={m} />
      ))}
      {status?.type === "pending" && <PendingCard topic={status.topic} />}
      {status?.type === "none" && pastMatches.length === 0 && <EmptyCard />}

      {pastMatches.length > 0 && (
        <div className="space-y-3 pt-2">
          {(status?.type === "none" || status?.type === "pending") && (
            <p className="text-xs text-muted uppercase tracking-wide">Previous matches</p>
          )}
          {status?.type === "matched" && (
            <p className="text-xs text-muted uppercase tracking-wide pt-2">Previous matches</p>
          )}
          {pastMatches.map((m) => (
            <MatchedCard key={m.matchId} match={m} disabled />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchedCard({ match, disabled = false }: { match: MatchEntry; disabled?: boolean }) {
  const { matchId, token, topic, matchFirstName, matchedOn } = match;
  const monthYear = new Date(matchedOn + "T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });

  const card = (
    <div className={`bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 space-y-2 transition-shadow ${disabled ? "opacity-50" : "hover:shadow-md"}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{topic === "coffee" ? "☕" : "🛝"}</span>
        <div>
          <p className="font-semibold text-dark text-sm">
            {topic === "coffee"
              ? `Coffee with ${matchFirstName}`
              : `Playdate with ${matchFirstName}`}
          </p>
          <p className="text-xs text-muted mt-0.5">{monthYear}</p>
        </div>
        <span className={`ml-auto text-xs rounded-full px-2.5 py-1 shrink-0 ${disabled ? "text-muted bg-gray-100" : "text-green-700 bg-green-50"}`}>
          {disabled ? "Past" : "Matched"}
        </span>
      </div>
    </div>
  );

  if (disabled) return card;

  return (
    <Link href={`/matches/${matchId}?token=${token}`} className="block">
      {card}
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
