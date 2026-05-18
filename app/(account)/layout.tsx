"use client";

import PageLayout from "@/components/PageLayout";
import AccountTabNav from "@/components/AccountTabNav";
import { AccountProvider, useAccount } from "@/app/(account)/AccountContext";

function AccountShell({ children }: { children: React.ReactNode }) {
  const { member } = useAccount();

  return (
    <PageLayout>
      <main className="flex-1 px-6 pt-8 pb-16 max-w-5xl mx-auto w-full">
        {member && <AccountTabNav />}
        {children}
      </main>
    </PageLayout>
  );
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      <AccountShell>{children}</AccountShell>
    </AccountProvider>
  );
}
