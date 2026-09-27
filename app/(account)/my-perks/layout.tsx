import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your perks · Postpartum Post",
  robots: { index: false },
};

export default function MyPerksLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
