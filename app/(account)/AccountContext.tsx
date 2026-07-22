"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { getMemberProfile, type MemberProfile } from "@/app/actions/profile";

type AccountContextValue = {
  loading: boolean;
  email: string | null;
  member: MemberProfile | null;
};

const AccountContext = createContext<AccountContextValue>({
  loading: true,
  email: null,
  member: null,
});

export function useAccount() {
  return useContext(AccountContext);
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
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
    if (!email) return;

    let cancelled = false;

    (async () => {
      try {
        const memberData = await getMemberProfile(email);
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
  }, [email]);

  return (
    <AccountContext.Provider value={{ loading, email, member }}>
      {children}
    </AccountContext.Provider>
  );
}
