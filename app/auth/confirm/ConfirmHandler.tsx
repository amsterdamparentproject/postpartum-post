"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyMagicLinkToken } from "@/lib/auth-confirm";
import { createBrowserClient } from "@/lib/supabase";
import { markFreshSignIn } from "@/lib/fresh-signin";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import PartnerLoginRequest from "@/components/PartnerLoginRequest";
import PageLayout from "@/components/PageLayout";
import CalloutBox from "@/components/CalloutBox";

type Status = "loading" | "success" | "error" | "invalid";

/**
 * Shared confirm-page logic for both /auth/confirm and /auth/confirm/[next].
 *
 * `next` is passed in as a prop (already resolved by the caller) rather than
 * read here as a bare `?next=` query param — see the [next]/page.tsx
 * docblock for why a query param doesn't work with this app's email
 * template.
 */
export default function ConfirmHandler({ next }: { next: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const supabase = createBrowserClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      // No token in the URL and a session already exists — just continue.
      // (With a token present we must still verify it below: a pre-existing
      // session may belong to a different account than the link's, e.g. a
      // stale test session, and skipping verification would silently ignore
      // the link and leave the visitor signed in as the wrong user.)
      if (session && !(tokenHash && type)) {
        setStatus("success");
        router.replace(next);
        return;
      }

      // PKCE flow: token_hash arrives as a query param (standard magic link emails)
      if (tokenHash && type) {
        verifyMagicLinkToken(tokenHash, type).then((errorMessage) => {
          if (errorMessage) {
            // Tokens are single-use: if this exact link was already
            // verified (e.g. a double-click or reload) the session it
            // created is still valid — continue instead of showing
            // "expired" to someone who's validly signed in.
            if (session) {
              setStatus("success");
              router.replace(next);
              return;
            }
            console.error("[auth/confirm] verifyOtp error:", errorMessage);
            setStatus("error");
          } else {
            markFreshSignIn();
            setStatus("success");
            router.replace(next);
          }
        });
        return;
      }

      // Implicit flow: access_token arrives in the hash fragment (admin.generateLink)
      if (window.location.hash.includes("access_token")) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_IN") {
            subscription.unsubscribe();
            markFreshSignIn();
            setStatus("success");
            router.replace(next);
          }
        });
        // Trigger the Supabase client to process the hash
        supabase.auth.getSession();
        return;
      }

      setStatus("invalid");
    });
  }, [router, searchParams, next]);

  if (status === "loading" || status === "success") {
    return <Spinner />;
  }

  // Link was expired, already used, or token is missing entirely
  const isExpired = status === "error";
  // /auth/confirm/[next] is shared between member and partner sign-in —
  // `next` (already decoded by the caller) is the only signal available
  // here for which retry form to show. Both destinations start with a
  // fixed, non-user-controlled prefix ("/partners" vs. everything else),
  // so this can't be spoofed into showing the wrong form for a real link.
  const isPartnerFlow = next.startsWith("/partners");

  return (
    <PageLayout>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <CalloutBox className="max-w-sm w-full">
          <div className="text-4xl mb-4">{isExpired ? "⏱️" : "🔗"}</div>
          <h2
            className="text-2xl text-dark mb-2"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {isExpired ? "This link has expired" : "Invalid sign-in link"}
          </h2>
          <p className="text-muted text-sm leading-relaxed mb-6">
            {isExpired
              ? "Sign-in links expire after 24 hours and can only be used once. Request a new one below."
              : "This link doesn't look right. Try requesting a fresh sign-in link."}
          </p>
          {isPartnerFlow ? <PartnerLoginRequest /> : <MagicLinkRequest />}
        </CalloutBox>
      </main>
    </PageLayout>
  );
}

export function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted text-sm">Signing you in…</p>
    </div>
  );
}
