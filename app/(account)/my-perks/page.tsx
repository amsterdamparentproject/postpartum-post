"use client";

import { useEffect, useState, useTransition } from "react";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import PerkCard from "@/components/PerkCard";
import PerkIdeaCard from "@/components/PerkIdeaCard";
import PostPerksWordMark from "@/components/PostPerksWordMark";
import Sparkle from "@/components/Sparkle";
import { useAccount } from "@/app/(account)/AccountContext";
import { listMemberPerks, redeemPerk, viewPerk, type MemberPerk, type PerkReveal } from "./actions";

// The Post Perks wordmark green (PostPerksWordMark).
const PERK_GREEN = "#8A9E3A";

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
  const [open, setOpen] = useState<MemberPerk | null>(null);

  useEffect(() => {
    if (member && accessToken) listMemberPerks(accessToken).then(setPerks);
  }, [member, accessToken]);

  if (loading) return <p className="text-muted text-sm text-center">Loading…</p>;
  if (!member) return <MagicLinkRequest />;

  function handleRedeemed(perkId: string, reveal: PerkReveal) {
    setPerks((list) => list?.map((p) => (p.id === perkId ? { ...p, reveal } : p)) ?? null);
    setOpen((p) => (p && p.id === perkId ? { ...p, reveal } : p));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          Your <PostPerksWordMark size="text-2xl" />
        </h2>
        <p className="text-sm text-muted mt-1">
          Treats at local spots, just for members. Each perk can be used once a month.
        </p>
      </div>

      {perks === null && <p className="text-sm text-muted">Loading…</p>}
      {perks?.length === 0 && (
        <p className="text-sm text-muted">No perks are live yet — check back soon! In the meantime, tell us where you&apos;d love one.</p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {perks?.map((perk) => (
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
            badge={
              perk.reveal ? (
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full shadow-sm text-white"
                  style={{ backgroundColor: PERK_GREEN }}
                >
                  Redeemed this month
                </span>
              ) : undefined
            }
          />
        ))}
        {perks !== null && <PerkIdeaCard />}
      </div>

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
            This uses your {monthName()} perk at {partnerName}. You can use each perk once a month.
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
                  Redeemed for {monthName()}
                </p>
                <p className="text-xs text-muted">Show this screen at {partnerName}.</p>
              </div>
            )}

            {reveal.redemption_type === "online" && (
              <div className="rounded-xl border-2 border-dashed p-4 space-y-2" style={{ borderColor: PERK_GREEN }}>
                <Sparkle className="w-10 h-auto mx-auto" />
                <p className="text-sm font-semibold" style={{ color: PERK_GREEN }}>
                  Redeemed for {monthName()}
                </p>
                <p className="text-xs text-muted">The discount applies at the link below, no code needed.</p>
              </div>
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
