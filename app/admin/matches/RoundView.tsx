"use client";

import { useState, useTransition } from "react";
import { deleteDraftPair, createDraftPair, computeCandidateScores, type RoundData, type DraftMember, type DraftPair, type CandidateScore } from "./actions";
import { ENABLE_TIME_OF_DAY } from "@/lib/flags";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fullName(m: DraftMember) {
  return `${m.first_name} ${m.last_name}`;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function formatChildAge(c: { birth_month: number; birth_year: number; expected: boolean }): string {
  const now = new Date();
  const birthDate = new Date(c.birth_year, c.birth_month - 1, 1);
  if (c.expected) {
    const weeks = Math.ceil((birthDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return weeks <= 0 ? "due soon" : `due in ${weeks}w`;
  }
  const months = Math.floor((now.getTime() - birthDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
  if (months < 1) return "newborn";
  if (months < 24) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

// ---------------------------------------------------------------------------
// Traffic light dot
// ---------------------------------------------------------------------------

type DotColor = "green" | "yellow" | "red" | "gray";

function Dot({ color }: { color: DotColor }) {
  const cls = {
    green:  "bg-green-500",
    yellow: "bg-yellow-400",
    red:    "bg-red-400",
    gray:   "bg-gray-200",
  }[color];
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${cls}`} />;
}

function parentTypeDot(a: DraftMember, b: DraftMember): DotColor {
  if (!a.parent_type || !b.parent_type) return "gray";
  if (a.parent_type === b.parent_type) return "green";          // both same (incl. both "anyone")
  if (a.parent_type === "anyone" || b.parent_type === "anyone") return "yellow"; // preference unconfirmed
  return "red";                                                  // mom + dad
}

function priorityDot(a: DraftMember, b: DraftMember): DotColor {
  if (!a.match_priority && !b.match_priority) return "gray";
  if (!a.match_priority || !b.match_priority) return "yellow"; // one set, one not
  return a.match_priority === b.match_priority ? "green" : "yellow"; // different priorities is fine, not a conflict
}

function languageDot(a: DraftMember, b: DraftMember, score: number): DotColor {
  if (!a.language?.length || !b.language?.length) return "gray";
  return score >= 1000 ? "green" : "red";
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersect = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersect / union;
}

/**
 * Overlap-aware color: red is reserved for genuinely zero shared days/times.
 * Any real overlap is at least yellow, even if it's a small slice of the
 * union (e.g. one person's only free day still falls within the other's).
 */
function fromOverlap(a: string[], b: string[]): DotColor {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersect = [...setA].filter((x) => setB.has(x)).length;
  if (intersect === 0 && (a.length > 0 || b.length > 0)) return "red";
  const score = jaccard(a, b);
  return score >= 0.7 ? "green" : "yellow";
}

function daysDot(a: DraftMember, b: DraftMember): DotColor {
  if (!a.availability || !b.availability) return "gray";
  return fromOverlap(a.availability.days, b.availability.days);
}

function timesDot(a: DraftMember, b: DraftMember): DotColor {
  if (!a.availability || !b.availability) return "gray";
  return fromOverlap(a.availability.times, b.availability.times);
}

function topicDot(a: DraftMember, b: DraftMember): DotColor {
  if (!a.topic_name || !b.topic_name) return "gray";
  return a.topic_name === b.topic_name ? "green" : "red";
}

function proximityDot(a: DraftMember, b: DraftMember, distKm: number | null): DotColor {
  if (distKm === null) return "gray";
  if (distKm <= 2) return "green";
  if (distKm <= 8) return "yellow";
  return "red";
}

function childrenDot(a: DraftMember, b: DraftMember, score: number): DotColor {
  if (!a.children?.length || !b.children?.length) return "gray";
  if (score >= 50) return "green";
  if (score >= 25) return "yellow";
  return "red";
}

// ---------------------------------------------------------------------------
// Score color by tier
// ---------------------------------------------------------------------------

function scoreColor(tier: DraftPair["quality_tier"]) {
  return tier === "great" ? "text-green-600" : tier === "good" ? "text-yellow-500" : "text-red-500";
}

// ---------------------------------------------------------------------------
// Member detail card
// ---------------------------------------------------------------------------

function MemberDetailCard({
  member,
  other,
  breakdown,
  isDouble,
  locked,
  onRemove,
  isPending,
}: {
  member: DraftMember;
  other: DraftMember;
  breakdown: DraftPair["breakdown"];
  isDouble: boolean;
  locked: boolean;
  onRemove: () => void;
  isPending: boolean;
}) {
  const proximityKm =
    member.lat && other.lat
      ? haversineKm({ lat: member.lat, lng: member.lng! }, { lat: other.lat, lng: other.lng! })
      : null;
  const proximity = proximityKm !== null ? `${Math.round(proximityKm)}km` : "N/A";

  const fields = [
    {
      label: "Language",
      value: member.language?.length ? member.language.map((l) => l.charAt(0).toUpperCase() + l.slice(1)).join(", ") : "N/A",
      dot: languageDot(member, other, breakdown.language),
    },
    {
      label: "Parent",
      value: member.parent_type ? (member.parent_type === "mom" ? "Moms" : member.parent_type === "dad" ? "Dads" : "Anyone") : "N/A",
      dot: parentTypeDot(member, other),
    },
    {
      label: "Days",
      value: member.availability?.days?.length ? member.availability.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(", ") : "N/A",
      dot: daysDot(member, other),
    },
    ...(ENABLE_TIME_OF_DAY ? [{
      label: "Time",
      value: member.availability?.times?.length ? member.availability.times.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(", ") : "N/A",
      dot: timesDot(member, other),
    }] : []),
    {
      label: "Topic",
      value: member.topic_name ? member.topic_name.charAt(0).toUpperCase() + member.topic_name.slice(1) : "N/A",
      dot: topicDot(member, other),
    },
    {
      label: "Proximity",
      value: proximity,
      dot: proximityDot(member, other, proximityKm),
    },
    {
      label: "Children",
      value: member.children?.length ? member.children.map(formatChildAge).join(", ") : "N/A",
      dot: childrenDot(member, other, breakdown.children),
    },
  ];

  return (
    <div className="flex-1 min-w-0 bg-white rounded-xl border border-border p-4 space-y-2 relative">
      {/* Top-right controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {isDouble && (
          <span className="text-xs font-bold bg-[#caadff] text-dark rounded-md px-1.5 py-0.5">2</span>
        )}
        {!locked && (
          <button
            onClick={onRemove}
            disabled={isPending}
            className="text-muted hover:text-coral transition text-base leading-none disabled:opacity-40"
            title="Remove from pair"
          >
            ✕
          </button>
        )}
      </div>

      {/* Header */}
      <div className="mb-3 pr-10">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-dark text-sm truncate">
            {member.first_name} <span className="font-normal text-muted">({member.id.slice(0, 5)})</span>
          </p>
          {member.open_to_second_match && (
            <svg className="w-3.5 h-3.5 text-[#caadff] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-label="Open to second match">
              <title>Open to second match</title>
              <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918z" clipRule="evenodd" />
            </svg>
          )}
          {member.match_priority === "proximity" && (
            <span title="Prioritizes proximity" className="shrink-0">
              <svg className={`w-3.5 h-3.5 ${priorityDot(member, other) === "green" ? "text-green-500" : "text-yellow-400"}`} viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-2.079 3.218-4.512 3.218-7.327a7.5 7.5 0 10-15 0c0 2.815 1.274 5.248 3.218 7.327a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </span>
          )}
          {member.match_priority === "age" && (
            <span title="Prioritizes child age" className="shrink-0">
              <svg className={`w-3.5 h-3.5 ${priorityDot(member, other) === "green" ? "text-green-500" : "text-yellow-400"}`} viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>
            </span>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-1">
        {fields.map(({ label, value, dot }) => (
          <div key={label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted w-16 shrink-0">{label}</span>
            <span className="text-dark flex-1 truncate">{value}</span>
            <Dot color={dot} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Solo profile fields (no partner yet, so no comparison dots)
// ---------------------------------------------------------------------------

function MemberProfileFields({ member }: { member: DraftMember }) {
  const fields = [
    {
      label: "Language",
      value: member.language?.length ? member.language.map((l) => l.charAt(0).toUpperCase() + l.slice(1)).join(", ") : "N/A",
    },
    {
      label: "Parent",
      value: member.parent_type ? (member.parent_type === "mom" ? "Moms" : member.parent_type === "dad" ? "Dads" : "Anyone") : "N/A",
    },
    {
      label: "Days",
      value: member.availability?.days?.length ? member.availability.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(", ") : "N/A",
    },
    ...(ENABLE_TIME_OF_DAY ? [{
      label: "Time",
      value: member.availability?.times?.length ? member.availability.times.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(", ") : "N/A",
    }] : []),
    {
      label: "Topic",
      value: member.topic_name ? member.topic_name.charAt(0).toUpperCase() + member.topic_name.slice(1) : "N/A",
    },
    {
      label: "Zipcode",
      value: member.zipcode ?? "N/A",
    },
    {
      label: "Children",
      value: member.children?.length ? member.children.map(formatChildAge).join(", ") : "N/A",
    },
  ];

  return (
    <div className="space-y-1">
      {fields.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted w-16 shrink-0">{label}</span>
          <span className="text-dark flex-1 truncate text-right">{value}</span>
        </div>
      ))}
    </div>
  );
}

function MemberProfileIcons({ member }: { member: DraftMember }) {
  return (
    <>
      {member.open_to_second_match && (
        <svg className="w-3.5 h-3.5 text-[#caadff] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-label="Open to second match">
          <title>Open to second match</title>
          <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0 1 12.548-3.364l1.903 1.903h-3.183a.75.75 0 1 0 0 1.5h4.992a.75.75 0 0 0 .75-.75V4.356a.75.75 0 0 0-1.5 0v3.18l-1.9-1.9A9 9 0 0 0 3.306 9.67a.75.75 0 1 0 1.45.388zm15.408 3.352a.75.75 0 0 0-.919.53 7.5 7.5 0 0 1-12.548 3.364l-1.902-1.903h3.183a.75.75 0 0 0 0-1.5H2.984a.75.75 0 0 0-.75.75v4.992a.75.75 0 0 0 1.5 0v-3.18l1.9 1.9a9 9 0 0 0 15.059-4.035.75.75 0 0 0-.53-.918z" clipRule="evenodd" />
        </svg>
      )}
      {member.match_priority === "proximity" && (
        <span title="Prioritizes proximity" className="shrink-0">
          <svg className="w-3.5 h-3.5 text-muted" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-2.079 3.218-4.512 3.218-7.327a7.5 7.5 0 10-15 0c0 2.815 1.274 5.248 3.218 7.327a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        </span>
      )}
      {member.match_priority === "age" && (
        <span title="Prioritizes child age" className="shrink-0">
          <svg className="w-3.5 h-3.5 text-muted" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
          </svg>
        </span>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Needs Match card (unmatched member)
// ---------------------------------------------------------------------------

function NeedsMatchCard({
  member,
  allMembers,
  round,
  onUpdate,
}: {
  member: DraftMember;
  allMembers: DraftMember[];
  round: RoundData;
  onUpdate: (round: RoundData) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [candidates, setCandidates] = useState<CandidateScore[] | null>(null);
  const [index, setIndex] = useState(0);

  function openSelector() {
    setSelecting(true);
    setIndex(0);
    if (!candidates) {
      startTransition(async () => {
        const scores = await computeCandidateScores(round.id, member.id);
        setCandidates(scores);
      });
    }
  }

  function closeSelector() {
    setSelecting(false);
    setError(null);
  }

  function handleAssign(newMemberId: string) {
    setError(null);
    startTransition(async () => {
      const result = await createDraftPair(round.id, member.id, newMemberId, round.month);
      if (result.success) {
        setCandidates(null);
        setSelecting(false);
        setIndex(0);
        onUpdate(result.round);
      } else {
        setError(result.error);
      }
    });
  }

  const current = candidates?.[index] ?? null;

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl border border-dashed border-red-300 shadow-sm p-5 space-y-3">
      {selecting && current && (
        <p className="text-center text-sm font-medium text-muted">
          Match score:{" "}
          <span className={`font-bold text-base ${
            current.score >= 1500 ? "text-green-600" : current.score >= 500 ? "text-yellow-500" : "text-red-500"
          }`}>
            {current.score}
          </span>
        </p>
      )}

      <div className="flex gap-4 items-stretch">
        {!selecting ? (
          <>
            {/* Member card */}
            <div className="flex-1 min-w-0 bg-white rounded-xl border border-border p-4 space-y-2 relative">
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <MemberProfileIcons member={member} />
              </div>
              <div className="pr-8">
                <p className="font-semibold text-dark text-sm truncate">
                  {fullName(member)} <span className="font-normal text-muted">({member.id.slice(0, 5)})</span>
                </p>
                <p className="text-xs text-muted truncate">{member.email}</p>
              </div>
              <MemberProfileFields member={member} />
            </div>

            {/* Needs match side */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
              <div className="flex flex-col items-center gap-2">
                <p className="font-semibold text-red-500 text-sm text-center">Needs match</p>
                <button
                  onClick={openSelector}
                  disabled={isPending}
                  className="text-xs px-3 py-1.5 border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-50"
                >
                  Assign match →
                </button>
              </div>
            </div>
          </>
        ) : !candidates ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <p className="text-xs text-muted">Computing scores…</p>
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex-1 flex flex-col items-center gap-2 py-8">
            <p className="text-xs text-muted">No candidates available.</p>
            <button onClick={closeSelector} className="text-xs text-muted hover:text-dark">Cancel</button>
          </div>
        ) : current ? (
          <>
            <MemberDetailCard
              member={member}
              other={current.member}
              breakdown={current.breakdown}
              isDouble={false}
              locked
              onRemove={() => {}}
              isPending={isPending}
            />
            <MemberDetailCard
              member={current.member}
              other={member}
              breakdown={current.breakdown}
              isDouble={current.isAlreadyMatched}
              locked
              onRemove={() => {}}
              isPending={isPending}
            />
          </>
        ) : null}
      </div>

      {selecting && candidates && candidates.length > 0 && current && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="text-xs px-3 py-1.5 border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="text-xs text-muted">
              {index + 1} of {candidates.length}
              {current.isAlreadyMatched && (
                <span className="text-[#caadff] ml-1.5">2nd for {current.member.first_name}</span>
              )}
            </span>
            <button
              onClick={() => setIndex((i) => Math.min(candidates.length - 1, i + 1))}
              disabled={index === candidates.length - 1}
              className="text-xs px-3 py-1.5 border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-30"
            >
              Next →
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={closeSelector}
              disabled={isPending}
              className="flex-1 text-xs px-3 py-1.5 border border-border rounded-lg text-muted hover:text-dark transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleAssign(current.member.id)}
              disabled={isPending}
              className="flex-1 text-xs px-3 py-1.5 bg-coral text-white rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              Assign this match
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkmark toggle icon
// ---------------------------------------------------------------------------

function CheckCircleIcon({ solid = false }: { solid?: boolean }) {
  if (solid) {
    return (
      <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.086l4-5.5z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pair card
// ---------------------------------------------------------------------------

function PairCard({
  pair,
  doubleMatchedIds,
  locked,
  roundId,
  month,
  onUpdate,
}: {
  pair: DraftPair;
  doubleMatchedIds: Set<string>;
  locked: boolean;
  roundId: string;
  month: string;
  onUpdate: (round: RoundData) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDraftPair(roundId, pair.id, month);
      if (result.success) onUpdate(result.round);
      else setError(result.error);
    });
  }

  if (collapsed) {
    return (
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm px-5 py-3 flex items-center justify-between gap-3">
        <p className="text-sm text-dark truncate">
          {pair.member1.first_name} <span className="text-muted">({pair.member1.id.slice(0, 5)})</span>
          <span className="text-muted"> &amp; </span>
          {pair.member2.first_name} <span className="text-muted">({pair.member2.id.slice(0, 5)})</span>
        </p>
        <button
          onClick={() => setCollapsed(false)}
          className="shrink-0 text-green-600 hover:opacity-70 transition"
          title="Expand match"
        >
          <CheckCircleIcon solid />
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-5 space-y-3 ${isPending ? "opacity-60" : ""}`}>
      {/* Score */}
      <div className="relative">
        <p className="text-center text-sm font-medium text-muted">
          Match score: <span className={`font-bold text-base ${scoreColor(pair.quality_tier)}`}>{pair.score}</span>
        </p>
        <button
          onClick={() => setCollapsed(true)}
          className="absolute right-0 top-1/2 -translate-y-1/2 text-muted hover:text-green-600 transition"
          title="Mark as reviewed"
        >
          <CheckCircleIcon />
        </button>
      </div>

      {/* Members side by side */}
      <div className="flex gap-3">
        <MemberDetailCard
          member={pair.member1}
          other={pair.member2}
          breakdown={pair.breakdown}
          isDouble={doubleMatchedIds.has(pair.member1.id)}
          locked={locked}
          onRemove={handleRemove}
          isPending={isPending}
        />
        <MemberDetailCard
          member={pair.member2}
          other={pair.member1}
          breakdown={pair.breakdown}
          isDouble={doubleMatchedIds.has(pair.member2.id)}
          locked={locked}
          onRemove={handleRemove}
          isPending={isPending}
        />
      </div>

      {error && <p className="text-xs text-red-600 text-center">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round summary
// ---------------------------------------------------------------------------

function RoundSummary({ round }: { round: RoundData }) {
  const { great, good, needs_work } = round.tierCounts;
  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-dark text-base">
          {new Date(round.month + "-01").toLocaleString("en-NL", { month: "long", year: "numeric" })} round
        </h2>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          round.status === "locked"    ? "bg-gray-100 text-gray-500" :
          round.status === "committed" ? "bg-blue-100 text-blue-700" :
                                         "bg-amber-100 text-amber-700"
        }`}>
          {round.status === "locked" ? "Locked" : round.status === "committed" ? "Committed" : "Draft"}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3 text-center text-sm">
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-2xl font-bold text-dark">{round.pairs.length}</p>
          <p className="text-muted text-xs mt-0.5">pairs</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3">
          <p className="text-2xl font-bold text-green-600">{great}</p>
          <p className="text-muted text-xs mt-0.5">great</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-3">
          <p className="text-2xl font-bold text-yellow-500">{good}</p>
          <p className="text-muted text-xs mt-0.5">good</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3">
          <p className="text-2xl font-bold text-red-500">{needs_work}</p>
          <p className="text-muted text-xs mt-0.5">needs work</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm border-t border-border pt-3">
        <span className="text-muted">Round score</span>
        <span className="font-semibold text-dark">{round.round_score}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier tabs
// ---------------------------------------------------------------------------

type TierTab = "all" | "great" | "good" | "needs_work";

const TABS: { id: TierTab; label: string; activeClass: string }[] = [
  { id: "all",        label: "All",        activeClass: "border-dark text-dark" },
  { id: "great",      label: "Great",      activeClass: "border-green-500 text-green-600" },
  { id: "good",       label: "Good",       activeClass: "border-yellow-400 text-yellow-500" },
  { id: "needs_work", label: "Needs work", activeClass: "border-red-400 text-red-500" },
];

function TierTabs({
  tab,
  counts,
  onChange,
}: {
  tab: TierTab;
  counts: { all: number; great: number; good: number; needs_work: number };
  onChange: (t: TierTab) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map(({ id, label, activeClass }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
            tab === id
              ? activeClass
              : "border-transparent text-muted hover:text-dark"
          }`}
        >
          {label}
          <span className={`ml-1.5 text-xs ${tab === id ? "" : "text-muted"}`}>
            {counts[id]}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function RoundView({ initialRound }: { initialRound: RoundData }) {
  const [round, setRound] = useState(initialRound);
  const [tab, setTab] = useState<TierTab>("all");
  const locked = round.status === "locked" || round.status === "committed";
  const doubleMatchedIds = new Set(round.doubleMatchedIds);

  const tabCounts = {
    all:        round.pairs.length,
    great:      round.tierCounts.great,
    good:       round.tierCounts.good,
    needs_work: round.tierCounts.needs_work,
  };

  const visiblePairs =
    tab === "all"
      ? round.pairs
      : round.pairs.filter((p) => p.quality_tier === tab);

  return (
    <div className="space-y-6">
      <RoundSummary round={round} />

      {round.unmatched.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-2xl p-5 space-y-2">
          <p className="font-semibold text-red-700 text-sm">
            ⚠️ {round.unmatched.length === 1 ? "1 member" : `${round.unmatched.length} members`} could not be matched
          </p>
          <p className="text-red-600 text-xs">
            No willing <code className="bg-red-100 px-1 rounded">open_to_second_match</code> candidate was available. Reassign before EOD the 6th.
          </p>
        </div>
      )}

      {locked && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 text-center">
          This round is locked — match emails have been sent.
        </div>
      )}

      <TierTabs tab={tab} counts={tabCounts} onChange={setTab} />

      <div className="space-y-4">
        {visiblePairs.map((pair) => (
          <PairCard
            key={pair.id}
            pair={pair}
            doubleMatchedIds={doubleMatchedIds}
            locked={locked}
            roundId={round.id}
            month={round.month}
            onUpdate={setRound}
          />
        ))}

        {round.unmatched.map((member) => (
          <NeedsMatchCard
            key={member.id}
            member={member}
            allMembers={round.allMembers}
            round={round}
            onUpdate={setRound}
          />
        ))}

        {visiblePairs.length === 0 && tab !== "all" && (
          <p className="text-center text-sm text-muted py-6">No {tab.replace("_", " ")} matches this round.</p>
        )}
      </div>
    </div>
  );
}
