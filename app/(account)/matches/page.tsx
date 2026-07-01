"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import { useAccount } from "@/app/(account)/AccountContext";
import {
  getMatchStatus,
  getExclusions,
  addExclusion,
  addExclusionByMemberId,
  deleteExclusion,
  type MatchStatus,
  type MatchEntry,
  type Exclusion,
} from "./actions";

export default function MatchesPage() {
  const { loading, member } = useAccount();
  const [status, setStatus] = useState<MatchStatus | null>(null);
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);

  useEffect(() => {
    if (member) {
      getMatchStatus(member.id).then(setStatus);
      getExclusions(member.id).then(setExclusions);
    }
  }, [member]);

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest />;

  const pastMatches = status?.pastMatches ?? [];

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Left — match history (70%) */}
      <div className="flex-[7] space-y-8 min-w-0">
        {/* Current matches */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-dark pl-4">
            {status?.type === "matched" && status.matches.length > 1 ? "Current matches" : "Current match"}
          </h2>
          {status?.type === "matched" && status.matches.map((m) => (
            <MatchedCard
              key={m.matchId}
              match={m}
              memberId={member.id}
              onExclusionAdded={() => getExclusions(member.id).then(setExclusions)}
            />
          ))}
          {status?.type === "pending" && <PendingCard topic={status.topic} />}
          {status?.type === "skipped" && <SkippedCard month={status.month} />}
          {status?.type === "none" && pastMatches.length === 0 && <EmptyCard />}
        </section>

        {/* Past matches */}
        {pastMatches.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-dark pl-4">
              {pastMatches.length === 1 ? "Past match" : "Past matches"}
            </h2>
            {pastMatches.map((m) => (
              <MatchedCard key={m.matchId} match={m} memberId={member.id} disabled />
            ))}
          </section>
        )}
      </div>

      {/* Right — Admin (30%) */}
      <div className="flex-[3] min-w-0 space-y-0">
        <h2 className="text-base font-semibold text-dark pl-4 mb-4">Admin</h2>
        <MatchAdmin
          memberId={member.id}
          exclusions={exclusions}
          onExclusionsChange={setExclusions}
          activeMatch={status?.type === "matched" ? status.matches.find((m) => !m.rematchRequested) ?? null : null}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match admin panel
// ---------------------------------------------------------------------------

function MatchAdmin({
  memberId,
  exclusions,
  onExclusionsChange,
  activeMatch,
}: {
  memberId: string;
  exclusions: Exclusion[];
  onExclusionsChange: (e: Exclusion[]) => void;
  activeMatch: MatchEntry | null;
}) {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const result = await addExclusion(memberId, email);
      if (result.success) {
        setEmail("");
        setFeedback({ type: "success", message: `${result.exclusion.otherMemberName} added to your exclusion list.` });
        onExclusionsChange([result.exclusion, ...exclusions]);
      } else {
        const messages: Record<string, string> = {
          not_found: "No member found with that email address.",
          already_excluded: "That member is already on your exclusion list.",
          self: "You can't add yourself.",
        };
        setFeedback({ type: "error", message: messages[result.error] ?? "Something went wrong." });
      }
    });
  }

  function handleDelete(exclusionId: string) {
    startTransition(async () => {
      const result = await deleteExclusion(memberId, exclusionId);
      if (result.success) {
        onExclusionsChange(exclusions.filter((ex) => ex.id !== exclusionId));
      }
    });
  }

  return (
    <div className="space-y-3">
      {activeMatch && (() => {
        const beforeCutoff = new Date().getDate() <= 14;
        return (
          <div className="rounded-2xl border border-border bg-white/80 backdrop-blur p-6 space-y-2">
            <h2 className="font-semibold text-dark text-sm">Request a rematch</h2>
            <p className="text-xs text-muted">Something not working with your match? You can request to be matched with someone else this month.</p>
            {beforeCutoff ? (
              <Link
                href={`/rematch?member_id=${memberId}`}
                className="inline-block w-full text-center rounded-lg border border-border text-sm py-2 text-dark hover:border-coral hover:text-coral transition-colors"
              >
                Request a rematch
              </Link>
            ) : (
              <span className="inline-block w-full text-center rounded-lg border border-border text-sm py-2 text-muted cursor-not-allowed select-none">
                Rematches closed
              </span>
            )}
            <p className="text-xs text-muted">
              You have until the 14th to request a rematch.{" "}
              <Link href="/about#rematch" className="underline hover:text-dark transition-colors">
                Learn more
              </Link>
            </p>
          </div>
        );
      })()}
      <div className="rounded-2xl border border-border bg-white/80 backdrop-blur p-6 space-y-5">
      <h2 className="font-semibold text-dark text-sm">Parents you won't match with</h2>

      {/* Add exclusion form */}
      <form onSubmit={handleAdd} className="space-y-3">
        <label className="block text-xs text-muted">
          Their email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          required
          className="w-full rounded-lg border border-border px-3 py-2 text-sm text-dark placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-coral"
        />
        <button
          type="submit"
          disabled={isPending || !email}
          className="w-full rounded-lg bg-coral text-white text-sm py-2 font-medium transition-opacity hover:opacity-80 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          {isPending ? "Updating..." : "Add to Do Not Match"}
        </button>
        {feedback && (
          <p className={`text-xs ${feedback.type === "success" ? "text-green-700" : "text-red-600"}`}>
            {feedback.message}
          </p>
        )}
      </form>

      {/* Exclusions list */}
      {exclusions.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-muted">Your Do Not Match list</p>
          {exclusions.map((ex) => (
            <div
              key={ex.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-dark truncate">{ex.otherMemberName}</p>
                <p className="text-xs text-muted truncate" title={ex.otherMemberEmail}>{ex.otherMemberEmail}</p>
              </div>
              <button
                onClick={() => handleDelete(ex.id)}
                disabled={isPending}
                className="shrink-0 text-xs text-muted hover:text-red-600 transition-colors cursor-pointer disabled:opacity-40"
                title="Remove exclusion"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {exclusions.length === 0 && (
        <p className="text-xs text-muted">No exclusions yet.</p>
      )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match history cards
// ---------------------------------------------------------------------------

function MatchedCard({
  match,
  memberId,
  disabled = false,
  onExclusionAdded,
}: {
  match: MatchEntry;
  memberId: string;
  disabled?: boolean;
  onExclusionAdded?: () => void;
}) {
  const { matchId, token, topic, matchFirstName, matchLastName, matchEmail, matchMemberId, matchedOn, rematchRequested, rematchRequestedBy } = match;
  const monthYear = new Date(matchedOn + "T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });
  const isChanged = !disabled && rematchRequested;
  const isRequester = !!rematchRequestedBy && rematchRequestedBy === memberId;
  const [showConfirm, setShowConfirm] = useState(false);
  const [isExcluded, setIsExcluded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  function handleAddToDoNotMatch() {
    startTransition(async () => {
      await addExclusionByMemberId(memberId, matchMemberId);
      setShowConfirm(false);
      setIsExcluded(true);
      onExclusionAdded?.();
    });
  }

  return (
    <div className={`bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm relative ${showConfirm ? "z-10" : "z-0"} ${disabled ? "opacity-50" : ""}`}>
      <div className="p-6 space-y-3">
        {/* Content + quick actions */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          {/* Title + date */}
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{topic === "coffee" ? "☕" : "🛝"}</span>
              <p className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
                {isChanged || disabled
                  ? topic === "coffee" ? "Coffee match" : "Playdate match"
                  : topic === "coffee" ? `Coffee with ${matchFirstName}` : `Playdate with ${matchFirstName}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted">{monthYear}</p>
              <span className={`text-xs rounded-full px-2.5 py-0.5 ${
                disabled ? "text-muted bg-gray-100" :
                isChanged ? "text-purple bg-purple/10" :
                "text-green-700 bg-green-50"
              }`}>
                {disabled ? "Past" : isChanged ? "Changed" : "Matched"}
              </span>
            </div>
          </div>

          {/* Right: quick actions — active matches only, top-aligned */}
          {!disabled && !isChanged && (
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Mail */}
              <a
                href={`mailto:${matchEmail}`}
                title={`Email ${matchFirstName}`}
                className="p-2 rounded-lg border border-border text-muted hover:text-dark hover:border-dark transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </a>

              {/* Rematch */}
              {new Date().getDate() <= 14 ? (
                <Link
                  href={`/rematch?member_id=${memberId}&match_id=${matchId}`}
                  title="Request a rematch"
                  className="p-2 rounded-lg border border-border text-muted hover:text-dark hover:border-dark transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                  </svg>
                </Link>
              ) : (
                <span
                  title="Rematches are closed after the 14th"
                  className="p-2 rounded-lg border border-border text-muted/40 cursor-not-allowed"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
                  </svg>
                </span>
              )}

              {/* Do not match */}
              <div className="relative" ref={dialogRef}>
                <button
                  onClick={() => !isExcluded && setShowConfirm((v) => !v)}
                  title={isExcluded ? "Added to do not match list" : "Add to Do Not Match list"}
                  disabled={isExcluded}
                  className={`p-2 rounded-lg border transition-colors ${
                    isExcluded
                      ? "border-red-200 text-red-400 cursor-default"
                      : "border-border text-muted hover:text-red-600 hover:border-red-300"
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
                  </svg>
                </button>

                {showConfirm && (
                  <div className="absolute right-0 top-10 z-10 w-max max-w-xs rounded-xl border border-border bg-white shadow-lg p-4 space-y-3">
                    <p className="text-sm text-dark font-medium">Add to Do Not Match list?</p>
                    <p className="text-xs text-muted">{matchFirstName} {matchLastName} ({matchEmail}) will never be matched with you again.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddToDoNotMatch}
                        disabled={isPending}
                        className="flex-1 text-xs rounded-lg bg-dark text-white py-1.5 hover:opacity-80 transition-opacity disabled:opacity-40"
                      >
                        {isPending ? "Adding…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setShowConfirm(false)}
                        className="flex-1 text-xs rounded-lg border border-border text-muted py-1.5 hover:border-dark hover:text-dark transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Changed message */}
        {isChanged && (
          isRequester ? (
            <p className="text-xs text-muted">
              Your match for this month has changed. If you&apos;ve requested a rematch, we&apos;ll be in touch soon.
            </p>
          ) : new Date().getDate() <= 14 ? (
            <p className="text-xs text-muted">
              Your match for this month has changed.{" "}
              <Link href={`/rematch?member_id=${memberId}&match_id=${matchId}`} className="underline hover:text-dark transition-colors">
                Request a rematch
              </Link>
              , or wait until next month to be matched with someone new.
            </p>
          ) : (
            <p className="text-xs text-muted">
              Your match for this month has changed. You&apos;ll hear from us with a new match next month.
            </p>
          )
        )}
      </div>

      {/* Full-width bottom button — active matches only */}
      {!disabled && !isChanged && (
        <Link
          href={`/matches/${matchId}?token=${token}`}
          className="block w-full text-center text-sm font-medium bg-coral text-white py-3 hover:opacity-90 transition-opacity border-t border-coral/20 rounded-b-2xl"
        >
          Go to match page
        </Link>
      )}
    </div>
  );
}

function SkippedCard({ month }: { month: string }) {
  const monthYear = new Date(month + "T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-3xl">⏩</span>
        <p className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>Skipped match</p>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted">{monthYear}</p>
        <span className="text-xs text-muted bg-gray-100 rounded-full px-2.5 py-0.5">Skipped</span>
      </div>
    </div>
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
    <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{topic === "coffee" ? "☕" : "🛝"}</span>
        <p className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          {topic === "coffee" ? "Coffee match" : "Playdate match"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted">{monthYear}</p>
        <span className="text-xs text-muted bg-gray-100 rounded-full px-2.5 py-0.5">Pending</span>
      </div>
      <p className="text-sm text-muted">
        We&apos;re arranging your introduction. You&apos;ll hear from us on the 7th.
      </p>
    </div>
  );
}
