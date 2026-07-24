"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ConfirmHandler, { Spinner } from "./ConfirmHandler";

// Bare route — still reads `next` from a `?next=` query param here (unlike
// /auth/confirm/[next], which takes it as a path segment). That's
// intentional, not leftover: app/api/optin/route.ts's signInAndRedirect
// builds exactly this shape (`/auth/confirm?next=...`) via
// admin.generateLink(), which redirects through Supabase's own hosted
// verify endpoint with the session in a hash fragment — never through the
// shared email template's `?token_hash=...` concatenation, so there's no
// collision risk for that caller. Only the signInWithOtp-based flows
// (MagicLinkRequest, SkipReAuthButton) needed to move off query params —
// see /auth/confirm/[next]/page.tsx's docblock.
function ConfirmPageInner() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/profile";
  return <ConfirmHandler next={next} />;
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ConfirmPageInner />
    </Suspense>
  );
}
