"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { encodeNextParam } from "@/lib/next-param";

export default function SkipReAuthButton({ email }: { email: string }) {
  const router = useRouter();
  const [isCorrectUser, setIsCorrectUser] = useState<boolean | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Check whether the currently logged-in session already matches this email
  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsCorrectUser(session?.user?.email === email);
    });
  }, [email]);

  function handleReAuth() {
    startTransition(async () => {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
      // Route through /auth/confirm/[next], not straight to /billing — see
      // components/MagicLinkRequest.tsx's comment for why, and why `next`
      // is base64url-encoded (lib/next-param.ts) rather than a `?next=`
      // query param or a plain encodeURIComponent path segment.
      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm/${encodeNextParam("/billing")}`,
        },
      });
      setSent(true);
    });
  }

  // Still checking session — render nothing to avoid a flash
  if (isCorrectUser === null) return null;

  // Already the right user — just go to billing
  if (isCorrectUser) {
    return (
      <button
        onClick={() => router.push("/billing")}
        className="w-full py-2.5 px-6 bg-coral hover:bg-coral-dark text-white text-sm font-semibold rounded-lg transition"
      >
        Go to billing →
      </button>
    );
  }

  // Wrong user or not logged in — sign out and send magic link
  if (sent) {
    return (
      <p className="text-sm text-muted text-center leading-relaxed">
        Sign-in link sent to <strong className="text-dark">{email}</strong> — check your inbox.
      </p>
    );
  }

  return (
    <button
      onClick={handleReAuth}
      disabled={isPending}
      className="w-full py-2.5 px-6 bg-coral hover:bg-coral-dark text-white text-sm font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isPending ? "Sending…" : "Check your billing →"}
    </button>
  );
}
