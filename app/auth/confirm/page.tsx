"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyMagicLinkToken } from "@/lib/auth-confirm";
import MagicLinkRequest from "@/components/MagicLinkRequest";
import PageLayout from "@/components/PageLayout";
import CalloutBox from "@/components/CalloutBox";

type Status = "loading" | "success" | "error" | "invalid";

function ConfirmHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const next = searchParams.get("next") ?? "/profile";

    if (!tokenHash || !type) {
      setStatus("invalid");
      return;
    }

    verifyMagicLinkToken(tokenHash, type).then((errorMessage) => {
      if (errorMessage) {
        console.error("[auth/confirm] verifyOtp error:", errorMessage);
        setStatus("error");
      } else {
        setStatus("success");
        router.replace(next);
      }
    });
  }, [router, searchParams]);

  if (status === "loading" || status === "success") {
    return <Spinner />;
  }

  // Link was expired, already used, or token is missing entirely
  const isExpired = status === "error";

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
          <MagicLinkRequest />
        </CalloutBox>
      </main>
    </PageLayout>
  );
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted text-sm">Signing you in…</p>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ConfirmHandler />
    </Suspense>
  );
}
