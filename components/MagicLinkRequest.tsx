"use client";

import { useState, useTransition } from "react";
import { createBrowserClient } from "@/lib/supabase";
import CalloutBox from "@/components/CalloutBox";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MagicLinkRequest({ defaultEmail }: { defaultEmail?: string } = {}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError(null);
    startTransition(async () => {
      const supabase = createBrowserClient();
      await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/profile` },
      });
      setSent(true);
    });
  }

  if (sent) {
    return (
      <CalloutBox className="max-w-sm mx-auto">
        <div className="text-4xl mb-4">💌</div>
        <h2
          className="text-2xl font-semibold text-dark mb-2"
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

  return (
    <div className="text-center max-w-sm mx-auto">
      <p className="text-dark font-medium mb-1">Sign in to your profile</p>
      <p className="text-muted text-sm mb-6">
        Enter the email address you signed up with and we&apos;ll send you a sign-in link.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
            placeholder="your@email.com"
            autoComplete="email"
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition"
          />
          {emailError && <p className="mt-1 text-xs text-coral text-left">{emailError}</p>}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? "Sending…" : "Send me a sign-in link"}
        </button>
      </form>
    </div>
  );
}
