"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { getMemberProfile, getTopics, type MemberProfile, type Topic } from "@/app/actions/profile";

type AccountContextValue = {
  loading: boolean;
  email: string | null;
  member: MemberProfile | null;
  topics: Topic[];
};

const AccountContext = createContext<AccountContextValue>({
  loading: true,
  email: null,
  member: null,
  topics: [],
});

export function useAccount() {
  return useContext(AccountContext);
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);

  useEffect(() => {
    const supabase = createBrowserClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const sessionEmail = session?.user?.email ?? null;
        setEmail(sessionEmail);
        if (sessionEmail) {
          const [memberData, topicsData] = await Promise.all([
            getMemberProfile(sessionEmail),
            getTopics(),
          ]);
          setMember(memberData);
          setTopics(topicsData);
        } else {
          setMember(null);
          setTopics([]);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AccountContext.Provider value={{ loading, email, member, topics }}>
      {children}
    </AccountContext.Provider>
  );
}
