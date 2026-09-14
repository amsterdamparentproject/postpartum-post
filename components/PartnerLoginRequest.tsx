"use client";

import { useState, useTransition } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { checkPartnerExists } from "@/app/actions/partners";
import { encodeNextParam } from "@/lib/next-param";
import CalloutBox from "@/components/CalloutBox";
import EnvelopeLogo from "@/components/EnvelopeLogo";
import PartnerLeadForm from "@/components/PartnerLeadForm";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type State = "idle" | "sending" | "sent" | "not_found";

/**
 * Mirrors components/MagicLinkRequest.tsx exactly for the sign-in half —
 * same signInWithOtp() call through /auth/confirm/[next] (no separate
 * invite flow: adding a partners row with an email IS the invite, the
 * first sign-in just mints the Supabase auth user). Diverges only in the
 * not_found state: a member's not_found shows SignupForm (join now); a
 * partner's not_found shows PartnerLeadForm (express interest, no account) —
 * this is the "Submit perk without a conversation with Alex" flow's
 * replacement, per the Sep 2026 self-service-portal pivot.
 *
 * Used with the default `showLeadFormOnNotFound=true` everywhere a
 * not-signed-in visitor can land in the partner section: the dedicated
 * /partners/login page (linked from PartnerSplash's "Are you an existing
 * partner?" line), the /auth/confirm retry state, and the not-signed-in
 * fallback on each of /partners/profile, /partners/perks, and
 * /partners/terms — each a minimal context where showing the lead form
 * inline on a not-found email is the right fallback, rather than
 * dead-ending.
 */
export default function PartnerLoginRequest({
  showLeadFormOnNotFound = true,
}: {
  showLeadFormOnNotFound?: boolean;
} = {}) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError(null);
    startTransition(async () => {
      const normalizedEmail = email.toLowerCase();
      const exists = await checkPartnerExists(normalizedEmail);
      if (!exists) {
        setState("not_found");
        return;
      }
      setState("sending");
      const supabase = createBrowserClient();
      const next = encodeNextParam("/partners/profile");
      await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm/${next}`,
        },
      });
      setState("sent");
    });
  }

  if (state === "sent") {
    return (
      <CalloutBox className="max-w-sm mx-auto">
        <EnvelopeLogo width={48} height={36} className="mx-auto mb-4" />
        <h2 className="text-2xl text-dark mb-2" style={{ fontFamily: "var(--font-serif)" }}>
          Check your inbox
        </h2>
        <p className="text-muted text-sm leading-relaxed">
          We sent a sign-in link to <strong>{email}</strong>. Click it to access your partner profile.
        </p>
      </CalloutBox>
    );
  }

  const notFound = state === "not_found";

  return (
    <div className="max-w-sm mx-auto space-y-6">
      <div className="text-center">
        <p className="text-dark font-medium mb-1">Partner sign-in</p>
        <p className="text-muted text-sm mb-6">
          Enter your business email and we&apos;ll send you a sign-in link.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); setState("idle"); }}
              placeholder="you@yourbusiness.com"
              autoComplete="email"
              className={`w-full px-4 py-2.5 rounded-lg border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition ${notFound || emailError ? "border-coral" : "border-border"}`}
            />
            {emailError && <p className="mt-1 text-xs text-coral text-left">{emailError}</p>}
            {notFound && (
              <p className="mt-1 text-xs text-coral text-left">
                {showLeadFormOnNotFound
                  ? "We don't have that email on file yet — tell us about your business below."
                  : "We don't have that email on file yet — use the interest form below to get in touch."}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending}
            data-umami-event="Partners: Request Link"
            className="w-full py-2.5 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? "Checking…" : "Send me a sign-in link"}
          </button>
        </form>
      </div>

      {notFound && showLeadFormOnNotFound && (
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <h2 className="text-xl text-dark mb-1" style={{ fontFamily: "var(--font-serif)" }}>
            Interested in becoming a Post Partner?
          </h2>
          <p className="text-sm text-muted mb-6">
            Offer Postpartum Post members a perk and get in front of new parents across Amsterdam.
          </p>
          <PartnerLeadForm defaultEmail={email} />
        </div>
      )}
    </div>
  );
}
