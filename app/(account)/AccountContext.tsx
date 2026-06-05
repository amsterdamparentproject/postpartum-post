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

  useEffect(() => {
    const supabase = createBrowserClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          const sessionEmail = session?.user?.email ?? null;
          setEmail(sessionEmail);
          if (sessionEmail) {
            const memberData = await getMemberProfile(sessionEmail);

            if (!memberData) {
              // Authenticated in Supabase but not in the members table.
              // Sign out so the stale session doesn't persist across refreshes —
              // the resulting SIGNED_OUT event will clear state and show MagicLinkRequest.
              await supabase.auth.signOut();
              // Don't return early — fall through to setLoading(false) so the
              // page is never left in a permanent loading state.
            } else {
              setMember(memberData);
            }
          } else {
            setMember(null);
          }
        } catch (err) {
          console.error("[AccountContext] auth state change error:", err);
          setMember(null);
        } finally {
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AccountContext.Provider value={{ loading, email, member }}>
      {children}
    </AccountContext.Provider>
  );
}
