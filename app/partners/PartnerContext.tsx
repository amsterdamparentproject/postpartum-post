"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { getPartnerProfile, type PartnerProfile } from "@/app/actions/partners";
import { consumeFreshSignIn } from "@/lib/fresh-signin";

type PartnerContextValue = {
  loading: boolean;
  email: string | null;
  accessToken: string | null;
  partner: PartnerProfile | null;
  refresh: () => void;
};

const PartnerContext = createContext<PartnerContextValue>({
  loading: true,
  email: null,
  accessToken: null,
  partner: null,
  refresh: () => {},
});

export function usePartner() {
  return useContext(PartnerContext);
}

/**
 * Mirrors app/(account)/AccountContext.tsx exactly, keyed on partners
 * instead of members — same session plumbing (magic-link via
 * signInWithOtp, /auth/confirm/[next] verifies it), so it inherits the
 * same two documented fixes rather than re-discovering them:
 *
 * 1. onAuthStateChange deadlock: never call an awaited Supabase auth method
 *    (getSession, signOut, refreshSession...) from inside its callback —
 *    supabase-js hangs forever (github.com/supabase/auth-js/issues/762).
 *    This effect only reads the session object handed to the callback.
 * 2. Fresh-token verification flake: a just-minted access token can fail
 *    requireMember()/requirePartner()'s auth.getUser() even for a genuinely
 *    valid session (documented in lib/supabase/generate-magic-link.ts) — so
 *    a failed lookup retries with a refreshed token before concluding "not
 *    a partner", rather than signing out on the first miss. Gated on
 *    lib/fresh-signin.ts's signal so this only costs the extra
 *    lookups/refreshSession round-trips right after a magic-link sign-in,
 *    not on every ordinary page load with some other pre-existing session
 *    (e.g. a signed-in member who simply isn't a partner) — before this,
 *    every such visit to /partners paid the same cost as a genuine flake.
 */
export function PartnerProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const supabase = createBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionEmail = session?.user?.email ?? null;
      setEmail(sessionEmail);
      setAccessToken(session?.access_token ?? null);
      if (!sessionEmail) {
        setPartner(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    (async () => {
      try {
        const maxAttempts = consumeFreshSignIn() ? 3 : 1;
        let token = accessToken;
        let partnerData: PartnerProfile | null = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          partnerData = await getPartnerProfile(token);
          if (partnerData || cancelled) break;
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 400 * attempt));
            const { data: refreshed, error: refreshError } = await createBrowserClient().auth.refreshSession();
            if (refreshError || !refreshed.session?.access_token) break;
            token = refreshed.session.access_token;
          }
        }
        if (cancelled) return;
        // Authenticated in Supabase but no matching partners row — just
        // show "not a partner" (PartnerSplash, via the null check in
        // app/partners/page.tsx). Deliberately never signs out: the same
        // Supabase client/session is shared with AccountContext (member
        // auth uses the same magic-link plumbing), so someone who's a
        // member but not a partner — or vice versa — must be able to
        // visit the "other" section without losing their real session.
        setPartner(partnerData ?? null);
      } catch (err) {
        console.error("[PartnerContext] profile lookup error:", err);
        if (!cancelled) setPartner(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshTick]);

  return (
    <PartnerContext.Provider
      value={{ loading, email, accessToken, partner, refresh: () => setRefreshTick((t) => t + 1) }}
    >
      {children}
    </PartnerContext.Provider>
  );
}
