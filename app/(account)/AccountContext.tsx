"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { getMemberProfile, type MemberProfile } from "@/app/actions/profile";

type AccountContextValue = {
  loading: boolean;
  email: string | null;
  /** Current session access token — pass to account server actions so they can
   *  verify identity server-side rather than trusting a client-supplied id. */
  accessToken: string | null;
  member: MemberProfile | null;
};

const AccountContext = createContext<AccountContextValue>({
  loading: true,
  email: null,
  accessToken: null,
  member: null,
});

export function useAccount() {
  return useContext(AccountContext);
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [member, setMember] = useState<MemberProfile | null>(null);

  // Registers the auth listener. Deliberately does nothing but read the
  // session and set `email` — no awaited Supabase calls of any kind here.
  // supabase-js has a documented deadlock bug where calling any async
  // Supabase auth method (getSession, signOut, etc.) from inside this
  // callback hangs forever: the callback holds an internal
  // navigator.locks-based mutex that the nested call also needs, and it
  // never releases (https://github.com/supabase/auth-js/issues/762). This
  // used to call `await supabase.auth.signOut()` directly in here when no
  // matching member was found — silently hangs the whole page on
  // "loading" forever, no console error, for exactly the case this
  // component exists to handle (an authenticated session with no matching
  // members row). The actual profile lookup + conditional sign-out now
  // happens in the next effect instead, entirely outside this callback's
  // execution context.
  useEffect(() => {
    const supabase = createBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionEmail = session?.user?.email ?? null;
      setEmail(sessionEmail);
      // access_token is available synchronously on the session object — safe to
      // read here (no awaited Supabase call, so no onAuthStateChange deadlock).
      setAccessToken(session?.access_token ?? null);
      if (!sessionEmail) {
        setMember(null);
        setLoading(false);
      }
      // When sessionEmail IS set, loading resolves via the effect below
      // once the profile lookup actually completes.
    });

    return () => subscription.unsubscribe();
  }, []);

  // Looks up the member for the current session's email, and signs out if
  // none is found — safely outside onAuthStateChange's callback (see
  // above). Re-runs whenever `email` changes.
  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    (async () => {
      try {
        // A freshly-minted access token can fail server-side verification
        // even for a genuinely active member — see the kid-less JWT issue
        // documented in lib/supabase/generate-magic-link.ts, which hits
        // requireMember()'s auth.getUser() call and makes getMemberProfile
        // return null exactly as if no member row existed. Diagnosed 2026-08
        // after a gift-card recipient's opt-in click landed on "isn't
        // associated with a subscription" despite her members/subscriptions
        // rows being entirely correct.
        //
        // Retrying with the SAME token would do nothing for that case — a
        // structurally malformed JWT verifies identically (and fails
        // identically) on every attempt, since nothing about the token
        // changes between calls. So each retry instead calls
        // refreshSession() first to mint a genuinely new access/refresh
        // token pair from GoTrue before trying the lookup again — this is
        // the part that can actually turn a failure into a success. It also
        // still covers the other plausible cause (transient backend/cache
        // lag) for free, since a fresh token re-verifies from scratch either
        // way. Safe to call here (not inside onAuthStateChange's callback —
        // see that effect's docblock on the deadlock this would otherwise risk).
        let token = accessToken;
        let memberData: MemberProfile | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          memberData = await getMemberProfile(token);
          if (memberData || cancelled) break;
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 400 * attempt));
            const { data: refreshed, error: refreshError } = await createBrowserClient().auth.refreshSession();
            if (refreshError || !refreshed.session?.access_token) break; // no new token to try — further attempts would be identical
            token = refreshed.session.access_token;
          }
        }
        if (cancelled) return;
        if (!memberData) {
          // Authenticated in Supabase but not in the members table.
          // Sign out so the stale session doesn't persist across
          // refreshes — the resulting SIGNED_OUT event (handled by the
          // effect above) clears state and shows MagicLinkRequest.
          setMember(null);
          await createBrowserClient().auth.signOut();
        } else {
          setMember(memberData);
        }
      } catch (err) {
        console.error("[AccountContext] profile lookup error:", err);
        if (!cancelled) setMember(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <AccountContext.Provider value={{ loading, email, accessToken, member }}>
      {children}
    </AccountContext.Provider>
  );
}
