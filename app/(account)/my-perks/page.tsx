"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import PerkCard from "@/components/PerkCard";
import PerkIdeaCard from "@/components/PerkIdeaCard";
import PostPerksWordMark from "@/components/PostPerksWordMark";
import Sparkle from "@/components/Sparkle";
import { useAccount } from "@/app/(account)/AccountContext";
import { listMemberPerks, redeemPerk, viewPerk, type MemberPerk, type PerkReveal } from "./actions";
import { optInFromMatches, type OptInAction } from "@/app/(account)/matches/actions";
import { isOptinWindowOpen } from "@/lib/optin-window";

// The Post Perks wordmark green (PostPerksWordMark).
const PERK_GREEN = "#8A9E3A";

type PerkFilter = "nearest" | "exclusive" | "unredeemed" | "all";

const PERK_FILTERS: { label: string; value: PerkFilter }[] = [
  { label: "Nearest", value: "nearest" },
  { label: "Exclusive", value: "exclusive" },
  { label: "Not yet redeemed", value: "unredeemed" },
  { label: "All", value: "all" },
];

function monthName(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", timeZone: "Europe/Amsterdam" });
}

/**
 * "Your Post" → Perks: every live perk as a PerkCard. Hover says "Redeem
 * now" (or "View perk" once used this month); clicking opens a dialog that
 * confirms the use, then reveals the code / link / in-person screen. Rules
 * and what's not gated yet: see ./actions.ts.
 */
export default function MyPerksPage() {
  const { loading, member, accessToken } = useAccount();
  const [perks, setPerks] = useState<MemberPerk[] | null>(null);
  // Whether the member has opted into anything this month (coffee, playdate,
  // or perks-only). null while loading; once perks is non-null this is
  // always a real boolean. See lib/monthly-opt-in.ts.
  const [optedIn, setOptedIn] = useState<boolean | null>(null);
  const [open, setOpen] = useState<MemberPerk | null>(null);
  const [filter, setFilter] = useState<PerkFilter>("nearest");
  // True right after opting into "Just Perks" -- via the opt-in email's
  // one-click link (/my-perks?optin=perks) or the prompt below -- to confirm it.
  const [justOptedInToPerks, setJustOptedInToPerks] = useState(false);

  function fetchPerks(token: string) {
    listMemberPerks(token).then((result) => {
      setOptedIn(result.optedIn);
      setPerks(result.perks);
      // Deep link from the match page's perks strip: /my-perks?perk=<id>
      // opens that perk's dialog straight away (and counts as a view).
      const params = new URLSearchParams(window.location.search);
      if (params.get("optin") === "perks" && result.optedIn) setJustOptedInToPerks(true);
      const perkId = params.get("perk");
      const linked = perkId ? result.perks.find((p) => p.id === perkId) : undefined;
      if (linked) {
        setOpen(linked);
        if (!linked.reveal) void viewPerk(token, linked.id);
      }
    });
  }

  useEffect(() => {
    if (!member || !accessToken) return;
    fetchPerks(accessToken);
  }, [member, accessToken]);

  // "All" keeps the server's own ranking (lib/perk-ranking.ts); the other
  // three re-sort or narrow that same list rather than re-fetching. Hook
  // stays above the early returns below (loading / not signed in) so it
  // runs on every render, same rule every other hook here follows.
  const filteredPerks = useMemo(() => {
    if (!perks) return perks;
    if (filter === "nearest") return [...perks].sort((a, b) => a.distanceKm - b.distanceKm);
    if (filter === "exclusive") return perks.filter((p) => p.exclusive);
    if (filter === "unredeemed") return perks.filter((p) => !p.reveal);
    return perks;
  }, [perks, filter]);

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest />;

  function handleRedeemed(perkId: string, reveal: PerkReveal) {
    setPerks((list) => list?.map((p) => (p.id === perkId ? { ...p, reveal } : p)) ?? null);
    setOpen((p) => (p && p.id === perkId ? { ...p, reveal } : p));
  }

  return (
    <div className="space-y-6">
      {perks !== null && optedIn === true && justOptedInToPerks && (
        // Same banner treatment as the profile and billing pages' opt-in banners.
        <div
          role="status"
          className="bg-[#caadff]/30 border border-[#caadff] rounded-2xl px-5 py-4 flex items-start justify-between gap-4"
        >
          <p className="text-sm text-dark leading-relaxed">
            You&apos;ve officially opted into <span className="font-semibold">Just Perks</span> this month! Enjoy ✨
          </p>
          <button
            onClick={() => setJustOptedInToPerks(false)}
            className="shrink-0 text-muted hover:text-dark transition text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div>
        <h2 className="text-2xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          Your <PostPerksWordMark size="text-2xl" />
        </h2>
        <p className="text-sm text-muted mt-1">
          Treats at local spots, just for members and their families. Perks run on the honor system and are
          honored by each business directly. <b className="text-coral">Each Post Perk can be used either once (intro offers) or once per month</b>, to keep things
          sustainable for both businesses and members alike.
        </p>
        <Link
          href="/terms#post-perks"
          className="inline-block mt-3 px-4 py-2 text-sm font-semibold rounded-lg border border-coral text-coral hover:bg-coral/5 transition"
        >
          How Post Perks work
        </Link>
      </div>

      {perks === null && <p className="text-sm text-muted">Loading…</p>}

      {perks !== null && optedIn === false && accessToken && (
        <NotOptedInPrompt
          accessToken={accessToken}
          onOptedIn={(action) => {
            if (action === "perks") setJustOptedInToPerks(true);
            fetchPerks(accessToken);
          }}
        />
      )}

      {perks !== null && optedIn === true && perks.length === 0 && (
        <p className="text-sm text-muted">No perks are live yet — check back soon! In the meantime, tell us where you&apos;d love one.</p>
      )}

      {perks !== null && optedIn === true && perks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {PERK_FILTERS.map(({ label, value }) => {
            const isActive = filter === value;
            return (
              <button
                key={value}
                onClick={() => setFilter(value)}
                data-umami-event="Perks: Filter"
                data-umami-event-filter={value}
                className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
                  isActive ? "" : "bg-white text-muted border-border hover:border-dark hover:text-dark"
                }`}
                style={isActive ? { background: PERK_GREEN, borderColor: PERK_GREEN, color: "#fff" } : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {perks !== null && optedIn === true && perks.length > 0 && filteredPerks?.length === 0 && (
        <p className="text-sm text-muted">No perks match this filter.</p>
      )}

      {perks !== null && optedIn === true && (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPerks?.map((perk) => (
          <PerkCard
            key={perk.id}
            perk={perk}
            partner={perk.partner}
            locationLabel={perk.location_label}
            onClick={() => {
              setOpen(perk);
              // Opening an unused perk counts as a view; re-opening one
              // already redeemed this month is just looking up the code.
              if (!perk.reveal && accessToken) void viewPerk(accessToken, perk.id);
            }}
            actionLabel={perk.reveal ? "View perk" : "Redeem now"}
            umamiEvent="Perks: Open card"
            badge={
              perk.reveal ? (
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full shadow-sm text-white"
                  style={{ backgroundColor: PERK_GREEN }}
                >
                  {perk.frequency === "once" ? "Redeemed" : "Redeemed this month"}
                </span>
              ) : undefined
            }
          />
        ))}
        {perks !== null && <PerkIdeaCard />}
      </div>
      )}

      {open && (
        <RedeemDialog
          perk={open}
          firstName={member.first_name}
          accessToken={accessToken ?? ""}
          onRedeemed={handleRedeemed}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/**
 * Shown on /my-perks in place of the perk grid when the member hasn't
 * responded to this month's opt-in at all (no monthly_participation or
 * monthly_perks row) -- true non-responders and members who already
 * skipped both land here (a skip can still be changed to any of these,
 * see optInFromMatches in matches/actions.ts). Once they pick something,
 * onOptedIn() re-fetches so the grid replaces this prompt.
 */
function NotOptedInPrompt({ accessToken, onOptedIn }: { accessToken: string; onOptedIn: (action: OptInAction) => void }) {
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<OptInAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const windowOpen = isOptinWindowOpen();

  function handleChoice(action: OptInAction) {
    setError(null);
    setPendingAction(action);
    startTransition(async () => {
      const result = await optInFromMatches(accessToken, action);
      if (result.success) {
        onOptedIn(action);
      } else {
        const messages: Record<string, string> = {
          closed: "The opt-in window for this month has closed.",
          already_responded: "You've already responded for this month.",
          no_balance: "You're out of rounds right now — check your billing page to see when you'll be back in.",
          server_error: "Something went wrong. Please try again.",
        };
        setError(messages[result.error] ?? "Something went wrong.");
        setPendingAction(null);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-dashed border-border p-6 space-y-4">
      <p className="text-sm text-dark">
        {windowOpen
          ? <>You haven&apos;t opted into this month&apos;s round yet. To access Post Perks, select:</>
          : <>It&apos;s not too late to join this month&apos;s round! Use a round for Post Perks now, or wait for next month&apos;s match.</>}
      </p>
      {windowOpen ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            onClick={() => handleChoice("coffee")}
            disabled={isPending}
            data-umami-event="Perks Prompt: Coffee + Perks"
            className="rounded-lg bg-coral text-white text-sm py-2.5 font-medium transition-opacity hover:opacity-80 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {isPending && pendingAction === "coffee" ? "One sec…" : "☕ Coffee + Perks"}
          </button>
          <button
            onClick={() => handleChoice("playdate")}
            disabled={isPending}
            data-umami-event="Perks Prompt: Playdate + Perks"
            className="rounded-lg bg-coral text-white text-sm py-2.5 font-medium transition-opacity hover:opacity-80 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {isPending && pendingAction === "playdate" ? "One sec…" : "🛝 Playdate + Perks"}
          </button>
          <button
            onClick={() => handleChoice("perks")}
            disabled={isPending}
            data-umami-event="Perks Prompt: Just Perks"
            className="rounded-lg bg-dark text-white text-sm py-2.5 font-medium transition-opacity hover:opacity-80 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {isPending && pendingAction === "perks" ? "One sec…" : "🎁 Just Perks"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => handleChoice("perks")}
          disabled={isPending}
          data-umami-event="Perks Prompt: Get this month's perks"
          className="rounded-lg bg-dark text-white text-sm py-2.5 px-4 font-medium transition-opacity hover:opacity-80 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          {isPending ? "One sec…" : "🎁 Get this month's Post Perks"}
        </button>
      )}
      <p className="text-xs text-muted">
        {windowOpen
          ? "Any choice above uses one of your rounds. Skipping this month doesn't."
          : "Getting this month's Post Perks uses one of your rounds. Prefer to wait? Next month's invitation lands in your inbox around the 1st."}
      </p>
      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  );
}

function RedeemDialog({
  perk,
  firstName,
  accessToken,
  onRedeemed,
  onClose,
}: {
  perk: MemberPerk;
  firstName: string;
  accessToken: string;
  onRedeemed: (perkId: string, reveal: PerkReveal) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const partnerName = perk.partner.business_name;

  function handleRedeem() {
    setError(null);
    startTransition(async () => {
      const result = await redeemPerk(accessToken, perk.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onRedeemed(perk.id, result.reveal);
    });
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the code is on screen to copy by hand.
    }
  }

  const reveal = perk.reveal;
  const isCode = perk.redemption_type === "code";

  const confirmBlock = (
    <>
      {error && <p className="text-xs text-coral">{error}</p>}
      <div className="flex justify-center gap-3">
        <button
          onClick={handleRedeem}
          disabled={isPending}
          data-umami-event="Perks: Redeem"
          data-umami-event-perk={perk.title}
          className="px-6 py-2.5 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60"
        >
          {isPending ? "One sec…" : isCode ? "Reveal code" : "Use this perk"}
        </button>
        <button onClick={onClose} className="text-sm text-muted hover:text-dark transition">
          Not now
        </button>
      </div>
    </>
  );


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark/40 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={perk.title}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{partnerName}</p>
          <h3 className="text-xl text-dark mt-1" style={{ fontFamily: "var(--font-serif)" }}>
            {perk.title}
          </h3>
          <p className="text-sm text-dark/80 mt-2 leading-relaxed">{perk.description}</p>
        </div>

        {/* Before redeeming, every perk gets the dashed green box with the
            confirm buttons inside (code perks also show the hidden code),
            and the once-a-month note underneath. */}
        {!reveal && (
          <div className="rounded-xl border-2 border-dashed p-4 space-y-3" style={{ borderColor: PERK_GREEN }}>
            {isCode && (
              <div>
                <p className="text-xs text-muted mb-1">Your code</p>
                <p className="font-mono text-2xl font-bold tracking-[0.3em] text-dark/25 select-none" aria-label="Hidden until you use this perk">
                  ••••••
                </p>
              </div>
            )}
            {confirmBlock}
          </div>
        )}
        {!reveal && (
          <p className="text-xs text-muted">
            {perk.frequency === "once"
              ? `This is a one-time intro offer at ${partnerName} — once you redeem it, it can't be used again.`
              : `This uses your ${monthName()} perk at ${partnerName}. You can use each perk once a month.`}
          </p>
        )}

        {reveal && (
          <div className="space-y-4">
            {reveal.redemption_type === "code" && reveal.code && (
              <div className="rounded-xl border-2 border-dashed p-4" style={{ borderColor: PERK_GREEN }}>
                <p className="text-xs text-muted mb-1">Your code</p>
                <p className="font-mono text-2xl font-bold tracking-wider text-dark break-all">{reveal.code}</p>
                <button
                  onClick={() => copyCode(reveal.code!)}
                  className="mt-2 text-sm font-semibold text-coral hover:text-coral-dark transition"
                >
                  {copied ? "Copied!" : "Copy code"}
                </button>
              </div>
            )}

            {/* Same dashed green box as a code, for every perk type. */}
            {reveal.redemption_type === "in_person" && (
              <div className="rounded-xl border-2 border-dashed p-4 space-y-2" style={{ borderColor: PERK_GREEN }}>
                <Sparkle className="w-10 h-auto mx-auto" />
                <p className="text-lg font-bold text-dark" style={{ fontFamily: "var(--font-serif)" }}>
                  {firstName} · Postpartum Post member
                </p>
                <p className="text-sm font-semibold" style={{ color: PERK_GREEN }}>
                  {perk.frequency === "once" ? "Redeemed" : `Redeemed for ${monthName()}`}
                </p>
                <p className="text-xs text-muted">Show this screen at {partnerName}.</p>
              </div>
            )}

            {reveal.redemption_type === "online" && (
              <div className="rounded-xl border-2 border-dashed p-4 space-y-2" style={{ borderColor: PERK_GREEN }}>
                <Sparkle className="w-10 h-auto mx-auto" />
                <p className="text-sm font-semibold" style={{ color: PERK_GREEN }}>
                  {perk.frequency === "once" ? "Redeemed" : `Redeemed for ${monthName()}`}
                </p>
                <p className="text-xs text-muted">The discount applies at the link below, no code needed.</p>
              </div>
            )}

            {perk.frequency === "once" && (
              <p className="text-xs text-muted">This intro offer can only be used once during your membership.</p>
            )}

            {reveal.url && (
              <a
                href={reveal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-2.5 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition"
              >
                {reveal.redemption_type === "online" ? "Go to offer" : `Visit ${partnerName}`}
              </a>
            )}

            <div>
              <button onClick={onClose} className="text-sm text-muted hover:text-dark transition">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
