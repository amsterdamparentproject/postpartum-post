import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your perks",
  robots: { index: false },
};

export default function MyPerksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
