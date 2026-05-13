"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { unsubscribe } from "@/app/actions/unsubscribe";

export default function UnsubscribeForm({ memberId }: { memberId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      try {
        await unsubscribe(memberId);
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setError("Something went wrong. Please try again or email us directly.");
        }
      }
    });
  }

  return (
    <div className="max-w-md w-full bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 text-center">
      <div className="text-4xl mb-5">🌿</div>
      <h1
        className="text-2xl font-semibold text-dark mb-3"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Cancel your subscription
      </h1>
      <p className="text-muted text-sm leading-relaxed mb-6">
        We&apos;re sorry to see you go. Cancelling will end your membership at the close of your current billing period — you won&apos;t be charged again, and you won&apos;t receive any more matches.
      </p>

      <div className="text-left text-sm text-muted space-y-2 mb-8 bg-cream rounded-xl p-4">
        <p>✦ &nbsp;No more monthly matches</p>
        <p>✦ &nbsp;No more access to monthly meetups</p>
        <p>✦ &nbsp;No further charges</p>
      </div>

      <p className="text-xs text-muted mb-6">
        Changed your mind? Just close this page. If you want to come back later, you&apos;re always welcome.
      </p>

      {error && (
        <p className="text-sm text-coral mb-4">{error}</p>
      )}

      <button
        onClick={handleCancel}
        disabled={isPending}
        className="w-full py-3 px-6 bg-dark hover:bg-dark/80 text-white font-semibold rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Cancelling…" : "Yes, cancel my subscription"}
      </button>

      <Link
        href="/"
        className="block mt-4 text-sm text-muted hover:text-dark transition"
      >
        Never mind, take me back
      </Link>
    </div>
  );
}
