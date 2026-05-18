"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { getMemberProfile, getTopics, type MemberProfile, type Topic } from "@/app/actions/profile";

type AccountContextValue = {
  loading: boolean;
  member: MemberProfile | null;
  topics: Topic[];
};

const AccountContext = createContext<AccountContextValue>({
  loading: true,
  member: null,
  topics: [],
});

export function useAccount() {
  return useContext(AccountContext);
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);

  useEffect(() => {
    const supabase = createBrowserClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user?.email) {
          const [memberData, topicsData] = await Promise.all([
            getMemberProfile(session.user.email),
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
    <AccountContext.Provider value={{ loading, member, topics }}>
      {children}
    </AccountContext.Provider>
  );
}
