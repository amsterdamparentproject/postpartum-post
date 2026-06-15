"use client";

import { useEffect, useState, useTransition } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { checkMemberExists } from "@/app/actions/profile";
import { getSignupMeta, type SignupMeta } from "@/app/actions/signup";
import CalloutBox from "@/components/CalloutBox";
import SignupForm from "@/components/SignupForm";
import EnvelopeLogo from "./EnvelopeLogo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type State = "idle" | "sending" | "sent" | "not_found";

export default function MagicLinkRequest({ defaultEmail }: { defaultEmail?: string } = {}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");
  const [notFoundEmail, setNotFoundEmail] = useState<string>("");
  const [signupMeta, setSignupMeta] = useState<SignupMeta | null>(null);
  const [isPending, startTransition] = useTransition();

  // Fetch signup meta lazily when we need to show the subscription form
  useEffect(() => {
    if (state === "not_found") {
      getSignupMeta().then(setSignupMeta);
    }
  }, [state]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError(null);
    startTransition(async () => {
      const normalizedEmail = email.toLowerCase();
      const exists = await checkMemberExists(normalizedEmail);
      if (!exists) {
        setNotFoundEmail(normalizedEmail);
        setState("not_found");
        return;
      }
      setState("sending");
      const supabase = createBrowserClient();
      await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: `${window.location.origin}/profile` },
      });
      setState("sent");
    });
  }

  if (state === "sent") {
    return (
      <CalloutBox className="max-w-sm mx-auto">
        <EnvelopeLogo width={48} height={36} className="mx-auto mb-4" />
        <h2
          className="text-2xl text-dark mb-2"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Check your inbox
        </h2>
        <p className="text-muted text-sm leading-relaxed">
          We sent a sign-in link to <strong>{email}</strong>. Click it to access your profile.
        </p>
      </CalloutBox>
    );
  }

  const notFound = state === "not_found";

  return (
    <div className="max-w-sm mx-auto space-y-6">
      <div className="text-center">
        <p className="text-dark font-medium mb-1">Sign in to your profile</p>
        <p className="text-muted text-sm mb-6">
          Enter the email address you signed up with and we&apos;ll send you a sign-in link.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); setState("idle"); }}
              placeholder="your@email.com"
              autoComplete="email"
              className={`w-full px-4 py-2.5 rounded-lg border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition ${notFound || emailError ? "border-coral" : "border-border"}`}
            />
            {emailError && <p className="mt-1 text-xs text-coral text-left">{emailError}</p>}
            {notFound && (
              <p className="mt-1 text-xs text-coral text-left">
                No profile found. Please try again with a different email.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending}
            data-umami-event="Sign In: Request Link"
            className="w-full py-2.5 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? "Checking…" : "Send me a sign-in link"}
          </button>
        </form>
      </div>

      {notFound && (
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8">
          <h2
            className="text-xl text-dark mb-1"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Or become a member now:
          </h2>
          <p className="text-sm text-muted mb-6">
            Subscribe and we&apos;ll introduce you to another new parent in Amsterdam each month.
          </p>
          <SignupForm
            first20SpotsRemaining={signupMeta?.first20SpotsRemaining}
            pilotOnly={signupMeta?.pilotOnly ?? true}
          />
        </div>
      )}
    </div>
  );
}
